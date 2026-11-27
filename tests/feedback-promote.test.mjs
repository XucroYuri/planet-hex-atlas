import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promote, renderRecommendation } from '../feedback/promote.mjs';

const repo = 'XucroYuri/planet-hex-atlas';
const base = {
  repo, issue: 7, decision: 'accept',
  summary: '为缺少官方数据的地区补充可追溯缺失说明。',
  evidence: '核对世界银行与国家统计局的统计范围。',
  impact: '只影响档案说明，不改变地图几何。',
  plan: '写入 missing-notes 并随下一版发布。',
  sources: ['https://data.worldbank.org/indicator/NY.GDP.MKTP.CD'],
};

async function sandbox() {
  return mkdtemp(join(tmpdir(), 'orbis-feedback-'));
}

test('promote writes a recommendation and a sorted index', async () => {
  const root = await sandbox();
  const result = await promote(base, { root });
  assert.equal(result.status, 'accepted');
  const markdown = await readFile(join(root, 'issue-7.md'), 'utf8');
  assert.match(markdown, /反馈建议 #7/);
  assert.match(markdown, /已采纳/);
  assert.match(markdown, new RegExp(`https://github\\.com/${repo}/issues/7`));
  assert.match(markdown, /统计范围/);
  assert.doesNotMatch(markdown, /ignore previous|rm -rf|curl http/i);
  await promote({ ...base, issue: 3, decision: 'defer', summary: '暂缓处理示例摘要。' }, { root });
  const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'));
  assert.deepEqual(index.recommendations.map(item => item.issue), [3, 7]);
  assert.deepEqual(index.recommendations.map(item => item.status), ['deferred', 'accepted']);
  assert.equal(index.recommendations[1].file, 'issue-7.md');
  assert.ok(index.updatedAt);
});

test('promote rejects bad input and duplicate issues', async () => {
  const root = await sandbox();
  await assert.rejects(promote({ ...base, repo: '../etc' }, { root }), /无效仓库/);
  await assert.rejects(promote({ ...base, issue: 0 }, { root }), /无效 issue/);
  await assert.rejects(promote({ ...base, decision: 'merge' }, { root }), /decision/);
  await assert.rejects(promote({ ...base, summary: '短' }, { root }), /summary/);
  await assert.rejects(promote({ ...base, sources: ['javascript:alert(1)'] }, { root }), /http/);
  await assert.rejects(promote({ ...base, sources: ['ok'] }, { root }), /http/);
  await promote(base, { root });
  await assert.rejects(promote(base, { root }), /已有建议/);
  await promote({ ...base, summary: '覆盖后的决策摘要内容。' }, { root, force: true });
  const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'));
  assert.equal(index.recommendations.length, 1);
});

test('renderRecommendation never embeds untrusted issue text', () => {
  const markdown = renderRecommendation({
    repo, issue: 9, status: 'accepted', summary: '摘要',
    evidence: '', impact: '', plan: '', sources: [], decidedAt: '2026-11-27T00:00:00.000Z',
  });
  assert.match(markdown, /不复制 issue 正文/);
  assert.doesNotMatch(markdown, /<script/i);
});
