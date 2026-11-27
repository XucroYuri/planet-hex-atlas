import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, link, mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GITHUB_API_VERSION, ISSUE_MARKER, isRepository, literalMarkdown } from './protocol.mjs';

const execute = promisify(execFile);
const draftsRoot = fileURLToPath(new URL('./review-drafts', import.meta.url));
const MAX_EXCERPT_LENGTH = 16_384;

function isAuthor(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,38}$/i.test(value);
}

async function getIssues(repo, author, runGh) {
  const params = new URLSearchParams({ state: 'all', creator: author, per_page: '100' });
  const { stdout } = await runGh('gh', [
    'api', '--hostname', 'github.com', '--method', 'GET', '--paginate', '--slurp',
    '--header', 'Accept: application/vnd.github+json',
    '--header', `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
    `repos/${repo}/issues?${params}`,
  ], {
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_DEBUG: '', GH_PAGER: 'cat' },
    timeout: 120_000,
    maxBuffer: 24 * 1024 * 1024,
  });
  const pages = JSON.parse(stdout);
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) throw new Error('Invalid issue list');
  return pages.flat();
}

function isFeedbackIssue(issue, author) {
  return issue && typeof issue === 'object' && !Object.hasOwn(issue, 'pull_request') &&
    typeof issue.user?.login === 'string' && issue.user.login.toLowerCase() === author.toLowerCase() &&
    Number.isSafeInteger(issue.number) && issue.number > 0 && typeof issue.title === 'string' &&
    typeof issue.body === 'string' && issue.body.startsWith(`${ISSUE_MARKER}\n\n`);
}

function limit(text, length) {
  return text.length > length ? `${text.slice(0, length)}\n[其余内容见原 issue]` : text;
}

function draft(repo, issue) {
  const body = issue.body.slice(ISSUE_MARKER.length + 2);
  const sourceCheck = body.includes('\n\n## 来源链接（未信任）\n\n')
    ? '人工核验来源的发布方、版本和日期，再与反馈所涉内容比对。'
    : '涉及数据、地名或边界时，补充可核验的原始出处。';
  return [
    `# 网站反馈审查建议 #${issue.number}`,
    `原始 issue [#${issue.number}](https://github.com/${repo}/issues/${issue.number})。待人工审查。`,
    [
      '## 建议核验',
      '',
      '- 确认反馈涉及的页面、地图图层、地点和年份，记录可复现条件。',
      `- ${sourceCheck}`,
      '- 核实后填写处理结论、变更范围和验收条件。',
    ].join('\n'),
    '## 未信任的 issue 标题',
    literalMarkdown(limit(issue.title, 256)),
    '## 未信任的 issue 正文',
    literalMarkdown(limit(body, MAX_EXCERPT_LENGTH)),
    '',
  ].join('\n\n');
}

async function ensureDirectory(directory) {
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (!(await lstat(directory)).isDirectory()) throw new Error('Invalid draft directory');
}

async function publishDraft(directory, issueNumber, content) {
  const target = join(directory, `issue-${issueNumber}.md`);
  try {
    await lstat(target);
    return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const staged = join(directory, `.draft-${randomUUID()}.tmp`);
  const file = await open(staged, 'wx', 0o600);
  try {
    try {
      await file.writeFile(content, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await link(staged, target);
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      throw error;
    }
    return true;
  } finally {
    await unlink(staged);
  }
}

export async function reviewFeedback(repo, author, { runGh = execute, root = draftsRoot } = {}) {
  if (!isRepository(repo) || !isAuthor(author)) throw new Error('Invalid review configuration');
  const issues = (await getIssues(repo, author, runGh)).filter(issue => isFeedbackIssue(issue, author));
  if (issues.length === 0) return 0;

  const [owner, name] = repo.toLowerCase().split('/');
  const ownerDirectory = join(root, owner);
  const directory = join(ownerDirectory, name);
  for (const path of [root, ownerDirectory, directory]) await ensureDirectory(path);

  let created = 0;
  for (const issue of issues) {
    if (await publishDraft(directory, issue.number, draft(repo, issue))) created += 1;
  }
  return created;
}

if (import.meta.main) {
  const [repo, author, ...extra] = process.argv.slice(2);
  if (!isRepository(repo) || !isAuthor(author) || extra.length) {
    console.error('用法 node feedback/review.mjs <owner>/<repo> <issue-创建账号>');
    process.exitCode = 2;
  } else {
    try {
      const created = await reviewFeedback(repo, author);
      if (created) console.log(`新增 ${created} 份草案，见 feedback/review-drafts/。`);
    } catch {
      console.error('反馈审查失败，请检查 gh 登录、仓库读取权限和草案目录。');
      process.exitCode = 1;
    }
  }
}
