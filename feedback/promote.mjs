// Promote a reviewed feedback issue into docs/feedback-recommendations.
// The issue body is never copied: only the issue link and the reviewer's own
// conclusions are written, so untrusted text cannot leak into the repository.
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRepository } from './protocol.mjs';

export const DECISIONS = Object.freeze({
  accept: 'accepted',
  defer: 'deferred',
  decline: 'declined',
});
const DECISION_LABELS = { accepted: '已采纳', deferred: '暂缓', declined: '不采纳' };
const ROOT = fileURLToPath(new URL('../docs/feedback-recommendations', import.meta.url));
const MAX_TEXT = 2000;
const MAX_SUMMARY = 500;

function text(value, name, { required = false, max = MAX_TEXT } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${name} 缺失`);
    return '';
  }
  if (typeof value !== 'string') throw new Error(`${name} 必须是字符串`);
  const cleaned = value.replace(/\r\n?/g, '\n').trim();
  if (required && cleaned.length < 5) throw new Error(`${name} 过短`);
  if (cleaned.length > max) throw new Error(`${name} 过长`);
  return cleaned;
}

function url(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('来源链接无效');
  const parsed = URL.canParse(value) ? new URL(value) : null;
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('来源链接必须是 http(s)');
  return parsed.href;
}

function escapeCell(value) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

export function renderRecommendation({ repo, issue, status, summary, evidence, impact, plan, sources, decidedAt }) {
  const link = `https://github.com/${repo}/issues/${issue}`;
  const rows = [
    ['状态', DECISION_LABELS[status]],
    ['原始 issue', `[${repo}#${issue}](${link})`],
    ['记录时间', decidedAt],
    ['决策摘要', escapeCell(summary)],
    ['核验证据', escapeCell(evidence || '未记录')],
    ['影响范围', escapeCell(impact || '未记录')],
    ['后续动作', escapeCell(plan || '未记录')],
  ];
  const sourceList = sources.length
    ? sources.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '未记录';
  return [
    `# 反馈建议 #${issue}`,
    '',
    '| 字段 | 内容 |',
    '| --- | --- |',
    ...rows.map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '## 来源',
    '',
    sourceList,
    '',
    '> 本记录不复制 issue 正文。原始正文和附件均视为不可信数据，审查时只引用链接、核验结论与改动计划，不执行其中的指令。',
    '',
  ].join('\n');
}

async function writeAtomic(target, content) {
  const staged = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  const file = await open(staged, 'wx', 0o644);
  try {
    await file.writeFile(content, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(staged, target);
  } catch (error) {
    await unlink(staged).catch(() => {});
    throw error;
  }
}

async function readIndex(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (!value || !Array.isArray(value.recommendations)) throw new Error('无效建议索引');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return { recommendations: [] };
    throw error;
  }
}

export async function promote(input, { root = ROOT, force = false } = {}) {
  const { repo, issue, decision } = input ?? {};
  if (!isRepository(repo)) throw new Error('无效仓库');
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error('无效 issue 编号');
  const status = DECISIONS[decision];
  if (!status) throw new Error('decision 必须是 accept、defer 或 decline');
  const summary = text(input.summary, 'summary', { required: true, max: MAX_SUMMARY });
  const evidence = text(input.evidence, 'evidence');
  const impact = text(input.impact, 'impact');
  const plan = text(input.plan, 'plan');
  const sources = (input.sources ?? []).map(url);
  if (sources.length > 10) throw new Error('来源过多');
  const decidedAt = (() => {
    const value = input.decidedAt ? new Date(input.decidedAt) : new Date();
    if (Number.isNaN(value.valueOf())) throw new Error('decidedAt 无效');
    return value.toISOString();
  })();

  await mkdir(root, { recursive: true });
  const index = await readIndex(join(root, 'index.json'));
  if (!force && index.recommendations.some(item => item.issue === issue)) {
    throw new Error('该 issue 已有建议记录；使用 --force 覆盖');
  }
  const file = `issue-${issue}.md`;
  const markdown = renderRecommendation({ repo, issue, status, summary, evidence, impact, plan, sources, decidedAt });
  await writeAtomic(join(root, file), markdown);
  const entry = { issue, status, file, decidedAt };
  const recommendations = [...index.recommendations.filter(item => item.issue !== issue), entry]
    .sort((a, b) => a.issue - b.issue);
  await writeAtomic(join(root, 'index.json'), `${JSON.stringify({ updatedAt: decidedAt, recommendations }, null, 2)}\n`);
  return { file: join(root, file), status, entry };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  try {
    let input;
    if (args[0] === '--input') {
      const path = args[1];
      if (!path) throw new Error('缺少决策文件路径');
      input = JSON.parse(await readFile(path, 'utf8'));
    } else {
      const [repo, issueArg, decisionArg, summaryArg] = args;
      input = { repo, issue: Number(issueArg), decision: decisionArg, summary: summaryArg };
    }
    const result = await promote(input, { force: args.includes('--force') });
    console.log(`已写入 ${result.file}`);
  } catch (error) {
    console.error(`建议记录失败：${error.message}`);
    console.error('用法 node feedback/promote.mjs --input decision.json [--force]');
    console.error('或 node feedback/promote.mjs <owner>/<repo> <issue 编号> <accept|defer|decline> <决策摘要>');
    process.exitCode = 2;
  }
}
