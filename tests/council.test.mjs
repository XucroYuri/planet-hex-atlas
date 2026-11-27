import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { renderCouncil } from '../web/js/council.js';
import {
  advanceCouncil, checkProposal, COUNCIL_MODEL_VERSION, COUNCIL_RULES, createCouncil, observeCouncil,
} from '../web/js/council-model.js';

const input = { region: 'CHN', year: 2020, seed: 'atlas-1', urban: 65, electric: 100 };
const start = (overrides = {}) => createCouncil({ ...input, ...overrides });
const run = (state, actions) => actions.reduce(advanceCouncil, state);
const jsonCopy = value => JSON.parse(JSON.stringify(value));

test('入口可作为 ES module 导入，起点和规则具有明确版本', () => {
  assert.equal(typeof renderCouncil, 'function');
  const state = start();
  assert.equal(state.modelVersion, COUNCIL_MODEL_VERSION);
  assert.deepEqual(state, jsonCopy(state));
  assert.deepEqual(Object.keys(state.goals), ['access', 'jobs', 'habitat']);
  assert.deepEqual(state.origin, input);
  assert.equal(checkProposal({ ...state, modelVersion: -1 }, 'hold').ok, false);
});

test('精确观测、真实零值和有标记的缺失规则分别保留', () => {
  const state = start({ urban: 0, electric: null });
  assert.deepEqual(state.measurements.urban, { observed: 0, used: 0, source: 'observed', reason: 'rounded-percent' });
  assert.deepEqual(state.measurements.electric, { observed: null, used: 70, source: 'fictional', reason: 'missing' });
  assert.deepEqual(start({ urban: null, electric: 101 }).measurements, {
    urban: { observed: null, used: 50, source: 'fictional', reason: 'missing' },
    electric: { observed: 101, used: 70, source: 'fictional', reason: 'outside-range' },
  });
  const fractional = start({ urban: 21.75, electric: 0 });
  assert.equal(fractional.origin.urban, 21.75);
  assert.equal(fractional.measurements.urban.used, 22);
  assert.equal(fractional.measurements.electric.used, 0);
  assert.throws(() => start({ urban: NaN }), TypeError);
});

test('地区、年份与地图比例只改变标记或物质起点，种子决定初始态度与门槛', () => {
  const state = start();
  const elsewhere = start({ region: 'JPN', year: 1960, urban: 0, electric: 0 });
  assert.deepEqual(elsewhere.circles, state.circles);
  assert.notDeepEqual(elsewhere.goals, state.goals);
  assert.notDeepEqual(start({ seed: 0 }).circles, state.circles);
});

test('枚举、接受门槛、期初预算和年末补充约束均可审计', () => {
  const state = Object.freeze(start());
  const before = jsonCopy(state);
  for (const policy of [undefined, null, 'constructor', 'toString', ['hold'], { policy: 'hold' }]) {
    const check = checkProposal(state, policy);
    assert.equal(check.ok, false);
    assert.ok(check.reason);
    assert.throws(() => advanceCouncil(state, policy), RangeError);
  }
  const rejected = checkProposal(state, 'ecology');
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.rules.map(rule => [rule.id, rule.ok]), [['budget', true], ['acceptance', false]]);
  assert.equal(rejected.rules[1].circle, 'stewards');
  assert.deepEqual(Object.keys(rejected.rules[1]).sort(), ['circle', 'id', 'ok', 'reason']);
  assert.throws(() => advanceCouncil(state, 'ecology'), /接受门槛/);

  const first = advanceCouncil(state, 'industry');
  assert.deepEqual(state, before);
  assert.deepEqual(first.ledger[0].budget, { opening: 8, spent: 5, restored: 2, closing: 5 });
  const second = advanceCouncil(first, 'industry');
  assert.equal(second.budget, 2);
  const next = advanceCouncil(second, 'hold');
  assert.equal(next.budget, 4);
  const budgetCheck = checkProposal(next, 'industry');
  assert.equal(budgetCheck.ok, false);
  assert.deepEqual(budgetCheck.rules.map(rule => [rule.id, rule.ok]), [['budget', false], ['acceptance', true]]);
  assert.throws(() => advanceCouncil(next, 'industry'), /预算不足/);
  assert.equal(checkProposal(advanceCouncil(next, 'hold'), 'industry').ok, true);
});

test('调研需要支付成本，临时降低门槛，次年仅公布一项分档样本', () => {
  const initial = start();
  const studied = advanceCouncil(initial, 'survey');
  assert.deepEqual(studied.ledger[0].budget, { opening: 8, spent: 3, restored: 2, closing: 7 });
  assert.equal(checkProposal(studied, 'ecology').ok, true);
  assert.deepEqual(observeCouncil(studied, 'residents').survey, { pending: { sampledAt: 1, availableAt: 2 }, report: null });
  const published = advanceCouncil(studied, 'hold');
  assert.equal(checkProposal(published, 'ecology').ok, true);
  const neighbors = { residents: 'workers', workers: 'stewards', stewards: 'residents' };
  for (const [role, circle] of Object.entries(neighbors)) {
    const { relief, survey } = observeCouncil(published, role);
    assert.equal(relief, COUNCIL_RULES.survey.relief);
    assert.equal(survey.pending, null);
    const { report } = survey;
    assert.deepEqual(Object.keys(report).sort(), ['availableAt', 'circle', 'maximum', 'minimum', 'policy', 'sampledAt']);
    assert.equal(report.sampledAt, 1);
    assert.equal(report.availableAt, 2);
    assert.equal(report.circle, circle);
    const sampled = studied.circles[circle].support[report.policy];
    assert.ok(report.minimum <= sampled && sampled <= report.maximum && report.maximum > report.minimum);
  }
  const repeated = observeCouncil(advanceCouncil(studied, 'survey'), 'residents').survey;
  assert.equal(repeated.report.sampledAt, 1);
  assert.equal(repeated.pending.sampledAt, 2);
  const expired = advanceCouncil(published, 'hold');
  assert.equal(observeCouncil(expired, 'residents').relief, 0);
  assert.equal(checkProposal(expired, 'ecology').ok, false);
});

test('阈值级联可追溯发件圈、边、收件圈、衰减与去重', () => {
  const initial = start();
  const state = run(initial, ['services', 'hold', 'hold', 'hold']);
  const arrivals = state.ledger.flatMap(entry => entry.signals.filter(event => event.status !== 'sent'));
  assert.deepEqual(arrivals.map(({ from, edge, to, hop, arrivesAt, status, reason }) =>
    [from, edge, to, hop, arrivesAt, status, reason]), [
    ['residents', 'street', 'workers', 1, 2, 'passed', 'threshold-met'],
    ['residents', 'bulletin', 'stewards', 1, 3, 'blocked', 'threshold-missed'],
    ['workers', 'meeting', 'stewards', 2, 3, 'passed', 'threshold-met'],
    ['stewards', 'river', 'residents', 3, 4, 'blocked', 'already-reached'],
  ]);
  const [street, bulletin, meeting] = arrivals;
  assert.equal(street.strength, 19);
  assert.equal(meeting.strength, 16);
  assert.equal(street.score, street.support + street.strength);
  assert.ok(street.score >= street.threshold);
  assert.ok(bulletin.score < bulletin.threshold);
  assert.ok(meeting.score >= meeting.threshold);
  assert.equal(state.circles.workers.support.services - initial.circles.workers.support.services, 5);
  assert.equal(state.circles.stewards.support.services - initial.circles.stewards.support.services, 5);
  assert.equal(state.circles.residents.support.services - initial.circles.residents.support.services, 6);
  assert.equal(state.circles.workers.support.industry - initial.circles.workers.support.industry, -2);
  assert.deepEqual(state.waves, []);
});

test('多轮级联可关闭原本达标的议案，调研能短暂恢复受理', () => {
  const equalToThreshold = run(start(), ['services', 'services', 'hold']);
  const workers = observeCouncil(equalToThreshold, 'workers');
  assert.equal(workers.beliefs.industry.support, workers.beliefs.industry.threshold);
  assert.equal(checkProposal(equalToThreshold, 'industry').ok, true);

  const belowThreshold = run(equalToThreshold, ['services', 'hold']);
  assert.deepEqual(checkProposal(belowThreshold, 'industry').rules.map(rule => rule.ok), [true, false]);
  assert.equal(checkProposal(run(belowThreshold, ['hold']), 'industry').ok, false);
  assert.equal(checkProposal(run(belowThreshold, ['survey']), 'industry').ok, true);
});

test('局部视图隔离圈内态度、未到信号与延迟回执，返回独立 JSON', () => {
  const first = advanceCouncil(start(), 'services');
  assert.deepEqual(observeCouncil(first, 'workers').history[0].signals, []);
  const second = advanceCouncil(first, 'hold');
  const receiver = observeCouncil(second, 'workers');
  const sender = observeCouncil(second, 'residents');
  assert.deepEqual(sender.history[1].signals, []);
  assert.deepEqual(observeCouncil(second, 'stewards').history[1].signals, []);
  const delivery = receiver.history[1].signals.find(event => event.direction === 'incoming');
  assert.equal(delivery.edge, 'street');
  assert.equal(delivery.knownAt, 2);
  assert.ok(Number.isInteger(delivery.score));
  assert.ok(Number.isInteger(delivery.threshold));

  const third = advanceCouncil(second, 'hold');
  const view = observeCouncil(third, 'residents');
  const [receipt] = view.history[2].signals;
  assert.equal(view.history[2].signals.length, 1);
  assert.equal(receipt.edge, 'street');
  assert.equal(receipt.direction, 'receipt');
  assert.equal(receipt.arrivesAt, 2);
  assert.equal(receipt.knownAt, 3);
  assert.equal(receipt.reason, 'threshold-met');
  for (const key of ['score', 'strength', 'threshold', 'support']) assert.ok(!Object.hasOwn(receipt, key));
  assert.deepEqual(Object.keys(view).sort(), ['beliefs', 'history', 'links', 'relief', 'role', 'round', 'survey', 'year']);
  assert.ok(view.links.every(link => link.from === 'residents' || link.to === 'residents'));
  assert.deepEqual(view, jsonCopy(view));
  assert.throws(() => observeCouncil(third, 'constructor'), RangeError);

  const before = jsonCopy(third);
  const originalView = jsonCopy(view);
  view.beliefs.services.support = -1;
  view.links[0].name = '变更';
  view.history[0].budget.closing = -1;
  view.history[0].goals.access.after = -1;
  view.history[0].signals[0].strength = -1;
  view.history[0].localChanges[0].after.services = -1;
  assert.deepEqual(third, before);
  assert.deepEqual(observeCouncil(third, 'residents'), originalView);
});

test('同一起点的五年分叉在三个目标上各自保留取舍，版本和行动可复演全状态', () => {
  const origin = start();
  const first = run(origin, ['services', 'services', 'hold', 'hold', 'services']);
  const second = run(origin, ['industry', 'survey', 'ecology', 'hold', 'hold']);
  assert.equal(origin.round, 0);
  assert.equal(first.year, 2025);
  assert.equal(second.year, first.year);
  assert.deepEqual(first.goals, { access: 90, jobs: 56, habitat: 52 });
  assert.deepEqual(second.goals, { access: 75, jobs: 58, habitat: 60 });
  for (const state of [first, second]) {
    const data = jsonCopy({ modelVersion: state.modelVersion, origin: state.origin, actions: state.ledger.map(entry => entry.policy) });
    assert.equal(data.modelVersion, COUNCIL_MODEL_VERSION);
    assert.deepEqual(run(createCouncil(data.origin), data.actions), state);
    assert.deepEqual(advanceCouncil(jsonCopy(state), 'hold'), advanceCouncil(state, 'hold'));
  }
});

test('暂缓可连续推进 120 年，收支恒等且点数和目标有界', () => {
  const origin = start({ urban: null, electric: null, seed: 0 });
  const actions = Array(120).fill('hold');
  const state = run(origin, actions);
  assert.equal(state.year, origin.year + 120);
  assert.equal(state.ledger.length, 120);
  assert.equal(state.budget, COUNCIL_RULES.budget.capacity);
  assert.deepEqual(state.goals, origin.goals);
  for (const entry of state.ledger) {
    const { opening, spent, restored, closing } = entry.budget;
    assert.equal(spent, 0);
    assert.equal(opening - spent + restored, closing);
    assert.ok(restored >= 0 && restored <= COUNCIL_RULES.budget.recovery);
    assert.ok(closing >= 0 && closing <= COUNCIL_RULES.budget.capacity);
    assert.ok(Object.values(entry.goals).every(({ after }) => Number.isInteger(after) && after >= 0 && after <= 100));
  }
  assert.deepEqual(run(createCouncil(state.origin), actions), state);
});
