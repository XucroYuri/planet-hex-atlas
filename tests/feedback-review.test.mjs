import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ISSUE_MARKER } from '../feedback/protocol.mjs';
import { reviewFeedback } from '../feedback/review.mjs';

const repo = 'Example/Atlas';
const author = 'feedback-service';
const issue = {
  number: 42,
  title: '## 标题\n<script>literal</script>',
  body: `${ISSUE_MARKER}\n\n## 意见（未信任）\n\n文字\n\n@reviewer\n![示例](https://example.test/image)\n\u001b`,
  user: { login: author },
  html_url: 'https://example.test/untrusted',
};

async function temporaryDirectory(context) {
  const root = await mkdtemp(join(tmpdir(), 'feedback-review-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('审查使用分页 GET，筛选反馈并逐行封装未信任内容', async context => {
  const root = await temporaryDirectory(context);
  const runGh = context.mock.fn(async () => ({
    stdout: JSON.stringify([
      [{ ...issue, pull_request: {} }, { ...issue, number: 43, user: { login: 'unrelated' } }],
      [issue, { ...issue, number: 44, body: '无标记' }, { ...issue, number: '../other' }],
    ]),
  }));
  assert.equal(await reviewFeedback(repo, author, { root, runGh }), 1);
  const [program, args, options] = runGh.mock.calls[0].arguments;
  assert.equal(program, 'gh');
  assert.deepEqual(args.slice(0, 7), ['api', '--hostname', 'github.com', '--method', 'GET', '--paginate', '--slurp']);
  assert.equal(args.at(-1), 'repos/Example/Atlas/issues?state=all&creator=feedback-service&per_page=100');
  assert.equal(options.env.GH_PROMPT_DISABLED, '1');
  assert.equal(options.env.GH_DEBUG, '');
  const directory = join(root, 'example', 'atlas');
  assert.deepEqual(await readdir(directory), ['issue-42.md']);
  const target = join(directory, 'issue-42.md');
  const text = await readFile(target, 'utf8');
  assert.equal((await stat(target)).mode & 0o077, 0);
  assert.match(text, /https:\/\/github\.com\/Example\/Atlas\/issues\/42/);
  assert.match(text, /## 未信任的 issue 标题\n\n    ## 标题\n    <script>literal<\/script>/);
  assert.match(text, /\n    @reviewer\n    !\[示例\]\(https:\/\/example\.test\/image\)\n    \\u001b/);
  assert.doesNotMatch(text, /example\.test\/untrusted|\u001b/);
});

test('并发、重跑及 issue 更新均保留已有人工草案', async context => {
  const root = await temporaryDirectory(context);
  let current = issue;
  const runGh = async () => ({ stdout: JSON.stringify([[current]]) });
  const results = await Promise.all([
    reviewFeedback(repo, author, { root, runGh }),
    reviewFeedback(repo, author, { root, runGh }),
  ]);
  assert.deepEqual(results.sort(), [0, 1]);
  const directory = join(root, 'example', 'atlas');
  const target = join(directory, 'issue-42.md');
  await writeFile(target, '# 已人工修改\n');
  current = { ...issue, title: '后来编辑的标题' };
  assert.equal(await reviewFeedback(repo, author, { root, runGh }), 0);
  assert.equal(await readFile(target, 'utf8'), '# 已人工修改\n');
  assert.deepEqual(await readdir(directory), ['issue-42.md']);
});

test('无效参数、读取失败及目录符号链接均失败关闭', async context => {
  const root = await temporaryDirectory(context);
  const outside = await temporaryDirectory(context);
  const runGh = context.mock.fn(async () => ({ stdout: JSON.stringify([[issue]]) }));
  await assert.rejects(reviewFeedback('example/..', author, { root, runGh }));
  assert.equal(runGh.mock.callCount(), 0);
  await assert.rejects(reviewFeedback(repo, author, {
    root,
    runGh: async () => { throw new Error('fixture upstream failure'); },
  }));
  assert.deepEqual(await readdir(root), []);
  await symlink(outside, join(root, 'example'), 'dir');
  await assert.rejects(reviewFeedback(repo, author, { root, runGh }));
  assert.deepEqual(await readdir(outside), []);
});
