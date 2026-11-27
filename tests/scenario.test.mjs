import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { renderScenario } from '../web/js/scenario.js';
import {
  HORIZON, METRICS, PATHS, advanceRun, allocationIssue, createRun, decodeExperiment, encodeExperiment,
  initialDraft, readObservation, replayRun,
} from '../web/js/sim-model.js';

const country = { id: 'CN', name: 'China', zh: '中国' };
const measurements = { income: 10_000, life: 70, electric: 50, forest: 40, pop: 1_000_000, urban: 25, renew: 20 };
const economyOnly = { services: 0, production: 100, ecology: 0 };
const ecologyOnly = { services: 0, production: 0, ecology: 100 };

function observation(values = measurements, year = 2023) {
  return readObservation({
    metrics: [{ id: 'income', code: 'NY.GDP.PCAP.CD' }],
    value: (countryId, metric, requestedYear) => countryId === country.id && requestedYear === year ? values[metric] ?? null : null,
  }, country, year);
}

function plan(branchA = PATHS[1].budget, branchB = PATHS[2].budget, forestFloor = null) {
  return { allocations: { a: branchA, b: branchB }, forestFloor };
}

test('入口可作为纯 ES module 导入', () => {
  assert.equal(typeof renderScenario, 'function');
});

test('起点只读取所选国与精确年份，真实零值和缺失分别保留', () => {
  const calls = [];
  const snapshot = readObservation({
    metrics: [{ id: 'income', code: 'NY.GDP.PCAP.CD' }],
    value: (id, metric, year) => {
      calls.push([id, metric, year]);
      if (year !== 1960) return 99;
      return { income: 1234.56789123, electric: 0, forest: null, renew: NaN }[metric];
    },
  }, country, 1960);
  assert.deepEqual(calls, METRICS.map(({ id }) => ['CN', id, 1960]));
  assert.equal(snapshot.countryName, '中国');
  assert.equal(snapshot.codes.income, 'NY.GDP.PCAP.CD');
  assert.deepEqual(snapshot.values, {
    income: 1234.56789123, life: null, electric: 0, forest: null, pop: null, urban: null, renew: null,
  });
  const run = advanceRun(createRun(snapshot), 1, plan()).trajectories;
  assert.equal(run.baseline[0].electric, 0);
  assert.ok(run.baseline[1].electric > 0);
  assert.equal(run.baseline[1].forest, null);
});

test('起点保留超范围的原始观测，缺失或超范围指标永远留空', () => {
  const snapshot = observation({ ...measurements, life: 125, forest: 104, renew: null });
  const run = advanceRun(createRun(snapshot), HORIZON, plan()).trajectories;
  assert.equal(snapshot.values.life, 125);
  assert.equal(snapshot.values.forest, 104);
  for (const path of Object.values(run)) {
    assert.ok(path.every(row => row.life === null && row.forest === null && row.renew === null));
    assert.ok(path.at(-1).income > snapshot.values.income);
  }
  assert.throws(() => advanceRun(createRun(observation({})), 1, plan()), /缺少可用观测/);
});

test('七个指标按各自的公式推演，基线与两条分支呈现不同取舍', () => {
  const { trajectories } = advanceRun(createRun(observation()), 1, plan());
  const expected = { income: 10_146.5, life: 70.33, electric: 52.075, forest: 40.204, pop: 1_002_300, urban: 25.7275, renew: 21.384 };
  for (const { id } of METRICS) assert.ok(Math.abs(trajectories.baseline[1][id] - expected[id]) < 1e-8, id);
  const branchA = trajectories.a[1];
  const branchB = trajectories.b[1];
  for (const id of ['income', 'life', 'electric', 'urban']) assert.ok(branchA[id] > branchB[id], id);
  for (const id of ['forest', 'renew']) assert.ok(branchB[id] > branchA[id], id);
  assert.notEqual(branchA.pop, branchB.pop);
});

test('年度预算取非负整数并允许结余，超支方案无进度', () => {
  const start = createRun(observation());
  const overspent = { ...economyOnly, services: 1 };
  assert.equal(allocationIssue(overspent), 'budget');
  for (const services of [undefined, null, '1', -1, 1.5, Infinity]) {
    assert.equal(allocationIssue({ ...ecologyOnly, services }), 'range');
  }
  assert.throws(() => advanceRun(start, 10, plan(ecologyOnly, overspent)), /分支 B/);
  assert.ok(Object.values(start).every(path => path.length === 1));
  const unspent = { services: 0, production: 0, ecology: 0 };
  assert.equal(allocationIssue(unspent), null);
  assert.equal(advanceRun(start, 10, plan(unspent)).advanced, 10);
});

test('森林底线截停首次违规年，三个轨迹共用安全进度', () => {
  const start = createRun(observation());
  const result = advanceRun(start, 10, plan(economyOnly, ecologyOnly, 39));
  assert.equal(result.advanced, 1);
  assert.equal(result.blocked.offset, 2);
  assert.equal(result.blocked.floor, 39);
  assert.equal(result.blocked.branches[0].id, 'a');
  assert.ok(result.blocked.branches[0].forest < 39);
  assert.ok(Object.values(result.trajectories).every(path => path.length === 2));
  assert.equal(result.trajectories.a[1].forest, 39.16);
  assert.ok(Object.values(start).every(path => path.length === 1));

  const resumed = advanceRun(result.trajectories, 5, plan(ecologyOnly, ecologyOnly, 39));
  assert.equal(resumed.advanced, 5);
  assert.equal(resumed.blocked, null);
  assert.equal(resumed.trajectories.a.length, 7);
});

test('底线只检查已建模的分支，按未舍入值判定并接受等于阈值', () => {
  const above = createRun(observation({ ...measurements, forest: 80 }));
  const allowed = advanceRun(above, 1, plan(ecologyOnly, ecologyOnly, 80));
  assert.equal(allowed.advanced, 1);
  assert.ok(allowed.trajectories.baseline[1].forest < 80);
  const forest = allowed.trajectories.a[1].forest;
  assert.equal(advanceRun(above, 1, plan(ecologyOnly, ecologyOnly, forest)).advanced, 1);
  assert.equal(advanceRun(above, 1, plan(ecologyOnly, ecologyOnly, forest + 0.00001)).advanced, 0);

  const missing = createRun(observation({ ...measurements, forest: null }));
  assert.throws(() => advanceRun(missing, 1, plan(ecologyOnly, ecologyOnly, 0)), /需要可用的森林率/);
  assert.throws(() => advanceRun(above, 1, plan(ecologyOnly, ecologyOnly, 100.01)), /介于 0% 与 100%/);
});

test('重复推进止于起点加一百年，全程比例和寿命有界', () => {
  const snapshot = observation({ ...measurements, electric: 100, forest: 0, urban: 99.99, renew: 100, life: 120 });
  const first = advanceRun(createRun(snapshot), 97, plan());
  const last = advanceRun(first.trajectories, 10, plan());
  assert.equal(last.advanced, 3);
  assert.equal(advanceRun(last.trajectories, 1, plan()).advanced, 0);
  for (const path of Object.values(last.trajectories)) {
    assert.equal(path.length, HORIZON + 1);
    for (const row of path) {
      for (const { id, maximum } of METRICS) {
        assert.ok(Number.isFinite(row[id]) && row[id] >= 0 && row[id] <= (maximum ?? Infinity), id);
      }
    }
  }
});

test('多阶段复演与逐步推进相同，JSON 区分起点和模拟并可恢复编辑状态', () => {
  const snapshot = observation(measurements, 1960);
  const firstPlan = plan(economyOnly, ecologyOnly, 39);
  const secondPlan = plan(ecologyOnly, ecologyOnly, 39);
  const first = advanceRun(createRun(snapshot), 10, firstPlan);
  const second = advanceRun(first.trajectories, 99, secondPlan);
  const draft = initialDraft();
  draft.allocations.a.services = '';
  draft.forestFloor = '43.5';
  const state = {
    observation: snapshot,
    phases: [{ years: first.advanced, ...firstPlan }, { years: second.advanced, ...secondPlan }],
    draft,
    cursor: 23,
  };
  assert.equal(second.advanced, 99);
  assert.deepEqual(replayRun(snapshot, state.phases), second.trajectories);
  const saved = decodeExperiment(JSON.parse(JSON.stringify(encodeExperiment(state))));
  assert.deepEqual(saved, { state, trajectories: second.trajectories });

  const archive = JSON.parse(JSON.stringify(encodeExperiment(state, second.trajectories)));
  assert.equal(archive.observation.year, 1960);
  assert.equal(archive.simulation.a[0].year, 1961);
  assert.equal(archive.simulation.a.at(-1).year, 2060);
  assert.equal(archive.assumptions.metrics.length, 7);
  assert.equal(archive.assumptions.coefficients.forestRecovery.ecology, 0.032);
  archive.simulation.a[0].forest = 999;
  assert.deepEqual(decodeExperiment(archive), saved);
});

test('存档拒绝版本不符、无效起点和超出硬约束的历史方案', () => {
  const state = { observation: observation(), phases: [], draft: initialDraft(), cursor: 0 };
  const file = encodeExperiment(state);
  assert.throws(() => decodeExperiment({ ...file, modelVersion: 2 }), /模型版本/);
  assert.throws(() => decodeExperiment({
    ...file, observation: observation({ ...measurements, life: null }, 2023.5),
  }), /起点观测/);
  assert.throws(() => decodeExperiment({ ...file, cursor: 1 }), /查看年份/);
  assert.throws(() => decodeExperiment({
    ...file, phases: [{ years: 10, ...plan(economyOnly, ecologyOnly, 39) }],
  }), /触及森林底线/);
  assert.throws(() => decodeExperiment({
    ...file, phases: [{ years: 99, ...plan() }, { years: 2, ...plan() }],
  }), /百年范围/);
});
