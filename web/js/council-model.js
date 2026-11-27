export const COUNCIL_MODEL_VERSION = 1;

function freezeRules(value) {
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object') freezeRules(item);
  }
  return Object.freeze(value);
}

export const COUNCIL_RULES = freezeRules({
  budget: { initial: 8, capacity: 10, recovery: 2 },
  survey: { relief: 8, rounds: 2, reportDelay: 1 },
  signal: { strength: 22, sponsorGain: 6, receiverGain: 5, otherLoss: 2, receiptDelay: 1 },
  goals: { access: '服务可及', jobs: '岗位韧性', habitat: '生态缓冲' },
  roles: { residents: '街坊圈', workers: '工坊圈', stewards: '水岸圈' },
  policies: {
    services: { name: '扩充社区服务', cost: 4, sponsor: 'residents', effects: { access: 5, jobs: 1, habitat: -2 } },
    industry: { name: '开放工坊用地', cost: 5, sponsor: 'workers', effects: { access: -1, jobs: 7, habitat: -4 } },
    ecology: { name: '修复河岸缓冲带', cost: 4, sponsor: 'stewards', effects: { access: 1, jobs: -2, habitat: 6 } },
    survey: { name: '走访调研', cost: 3 },
    hold: { name: '暂缓并恢复预算', cost: 0 },
  },
  edges: [
    { id: 'street', name: '街坊联络', from: 'residents', to: 'workers', loss: 3, barrier: 4, delay: 1 },
    { id: 'meeting', name: '共管例会', from: 'workers', to: 'stewards', loss: 3, barrier: 3, delay: 1 },
    { id: 'river', name: '河岸走访', from: 'stewards', to: 'residents', loss: 2, barrier: 5, delay: 1 },
    { id: 'bulletin', name: '公告转送', from: 'residents', to: 'stewards', loss: 8, barrier: 12, delay: 2 },
  ],
});

const PROFILES = {
  residents: { support: [61, 44, 43], thresholds: [52, 55, 54] },
  workers: { support: [46, 58, 38], thresholds: [52, 52, 54] },
  stewards: { support: [41, 40, 50], thresholds: [50, 55, 54] },
};
const POLICIES = Object.keys(COUNCIL_RULES.policies).filter(policy => COUNCIL_RULES.policies[policy].sponsor);
const EDGES = Object.fromEntries(COUNCIL_RULES.edges.map(edge => [edge.id, edge]));
const limit = value => Math.max(0, Math.min(100, value));

function seededDraw(seed) {
  let number = 2166136261;
  for (const character of `${typeof seed}:${seed}`) {
    number = Math.imul(number ^ character.codePointAt(0), 16777619) >>> 0;
  }
  return (minimum, maximum) => {
    number = (Math.imul(number, 1664525) + 1013904223) >>> 0;
    return minimum + (number >>> 8) % (maximum - minimum + 1);
  };
}

function measurement(value, fallback) {
  if (value != null && !Number.isFinite(value)) throw new TypeError('地图比例须为有限数字或 null。');
  const observed = value == null ? null : value === 0 ? 0 : value;
  if (observed !== null && observed >= 0 && observed <= 100) {
    return { observed, used: Math.round(observed), source: 'observed', reason: 'rounded-percent' };
  }
  return { observed, used: fallback, source: 'fictional', reason: observed === null ? 'missing' : 'outside-range' };
}

export function createCouncil({ region, year, seed, urban, electric }) {
  if (typeof region !== 'string' || !region.trim()) throw new TypeError('地区须为非空字符串。');
  if (!Number.isSafeInteger(year) || year < 1) throw new TypeError('起始年份须为正整数。');
  if (!Number.isSafeInteger(seed) && (typeof seed !== 'string' || !seed.trim())) {
    throw new TypeError('种子须为整数或非空字符串。');
  }
  const measurements = { urban: measurement(urban, 50), electric: measurement(electric, 70) };
  const urbanPoints = measurements.urban.used;
  const electricPoints = measurements.electric.used;
  const draw = seededDraw(seed);
  const circles = Object.fromEntries(Object.entries(PROFILES).map(([role, profile]) => [role, {
    support: Object.fromEntries(POLICIES.map((policy, index) => [policy, profile.support[index] + draw(-2, 2)])),
    thresholds: Object.fromEntries(POLICIES.map((policy, index) => [policy, profile.thresholds[index] + draw(0, 2)])),
  }]));
  return {
    modelVersion: COUNCIL_MODEL_VERSION,
    origin: { region, year, seed: seed === 0 ? 0 : seed, urban: measurements.urban.observed, electric: measurements.electric.observed },
    measurements,
    round: 0,
    year,
    budget: COUNCIL_RULES.budget.initial,
    goals: {
      access: 30 + Math.round((7 * electricPoints + 3 * urbanPoints) / 20),
      jobs: 30 + Math.round((2 * urbanPoints + electricPoints) / 10),
      habitat: 74 - Math.round(urbanPoints / 4),
    },
    circles,
    waves: [],
    ledger: [],
  };
}

function surveyRelief(state) {
  const { rounds, relief } = COUNCIL_RULES.survey;
  return state.ledger.slice(-rounds).some(entry => entry.policy === 'survey') ? relief : 0;
}

export function checkProposal(state, policy) {
  if (state?.modelVersion !== COUNCIL_MODEL_VERSION) {
    return { ok: false, reason: '模型版本不受支持。', rules: [] };
  }
  if (typeof policy !== 'string' || !Object.hasOwn(COUNCIL_RULES.policies, policy)) {
    return { ok: false, reason: '请选择一项有效的议事行动。', rules: [] };
  }
  const { cost, sponsor } = COUNCIL_RULES.policies[policy];
  const funded = state.budget >= cost;
  const rules = [{
    id: 'budget', ok: funded, available: state.budget, required: cost,
    reason: funded ? `有 ${state.budget} 点可用，本次需 ${cost} 点。` : `预算不足，需 ${cost} 点，现有 ${state.budget} 点。`,
  }];
  if (sponsor) {
    const circle = state.circles[sponsor];
    const accepted = circle.support[policy] >= circle.thresholds[policy] - surveyRelief(state);
    const name = COUNCIL_RULES.roles[sponsor];
    rules.push({
      id: 'acceptance', ok: accepted, circle: sponsor,
      reason: accepted ? `${name}达到本圈接受门槛。` : `${name}尚未达到本圈接受门槛。`,
    });
  }
  const blocked = rules.find(rule => !rule.ok);
  return { ok: !blocked, reason: blocked?.reason ?? '符合公开规则。', rules };
}

function shiftBeliefs(state, entry, role, wave, cause, gain) {
  const circle = state.circles[role];
  const before = { ...circle.support };
  for (const policy of POLICIES) {
    const change = policy === wave.policy ? gain : -COUNCIL_RULES.signal.otherLoss;
    circle.support[policy] = limit(circle.support[policy] + change);
  }
  entry.beliefs.push({ circle: role, wave: wave.id, cause, before, after: { ...circle.support } });
}

function sendSignals(entry, wave, from, strength, hop) {
  for (const edge of COUNCIL_RULES.edges) {
    if (edge.from !== from) continue;
    const message = {
      wave: wave.id, policy: wave.policy, edge: edge.id, from, to: edge.to, hop,
      strength: Math.max(0, strength - edge.loss), sentAt: entry.round, arrivesAt: entry.round + edge.delay,
    };
    wave.pending.push(message);
    entry.signals.push({ ...message, status: 'sent' });
  }
}

function receiveSignals(state, entry, relief) {
  for (const wave of state.waves) {
    const arriving = wave.pending.filter(message => message.arrivesAt === entry.round);
    wave.pending = wave.pending.filter(message => message.arrivesAt > entry.round);
    for (const message of arriving) {
      const circle = state.circles[message.to];
      const edge = EDGES[message.edge];
      const support = circle.support[wave.policy];
      const threshold = circle.thresholds[wave.policy] - relief + edge.barrier;
      const score = support + message.strength;
      const repeated = wave.reached.includes(message.to);
      const passed = !repeated && score >= threshold;
      entry.signals.push({
        ...message, status: passed ? 'passed' : 'blocked',
        reason: repeated ? 'already-reached' : passed ? 'threshold-met' : 'threshold-missed',
        score, support, threshold,
      });
      if (passed) {
        wave.reached.push(message.to);
        shiftBeliefs(state, entry, message.to, wave, 'signal', COUNCIL_RULES.signal.receiverGain);
        sendSignals(entry, wave, message.to, message.strength, message.hop + 1);
      }
    }
  }
  state.waves = state.waves.filter(wave => wave.pending.length);
}

function takeSurvey(state, round) {
  const samples = Object.fromEntries(Object.keys(PROFILES).map(role => {
    const { to: circle } = COUNCIL_RULES.edges.find(edge => edge.from === role);
    const policy = POLICIES.find(id => COUNCIL_RULES.policies[id].sponsor === circle);
    const minimum = Math.min(80, Math.floor(state.circles[circle].support[policy] / 20) * 20);
    return [role, { circle, policy, minimum, maximum: minimum === 80 ? 100 : minimum + 19 }];
  }));
  return { sampledAt: round, availableAt: round + COUNCIL_RULES.survey.reportDelay, samples };
}

export function advanceCouncil(state, policy) {
  const review = checkProposal(state, policy);
  if (!review.ok) throw new RangeError(review.reason);

  const next = JSON.parse(JSON.stringify(state));
  next.round += 1;
  next.year = next.origin.year + next.round;
  const { cost, sponsor, effects } = COUNCIL_RULES.policies[policy];
  const { capacity, recovery } = COUNCIL_RULES.budget;
  const restored = Math.min(recovery, capacity - (state.budget - cost));
  next.budget = state.budget - cost + restored;
  const goals = {};
  for (const goal of Object.keys(COUNCIL_RULES.goals)) {
    const after = limit(state.goals[goal] + (effects?.[goal] ?? 0));
    goals[goal] = { before: state.goals[goal], change: after - state.goals[goal], after };
    next.goals[goal] = after;
  }
  const entry = {
    round: next.round, year: next.year, policy, review,
    budget: { opening: state.budget, spent: cost, restored, closing: next.budget },
    goals, signals: [], beliefs: [], survey: null,
  };
  receiveSignals(next, entry, surveyRelief(state));
  if (sponsor) {
    const wave = { id: next.round, policy, reached: [sponsor], pending: [] };
    shiftBeliefs(next, entry, sponsor, wave, 'policy', COUNCIL_RULES.signal.sponsorGain);
    sendSignals(entry, wave, sponsor, COUNCIL_RULES.signal.strength, 1);
    next.waves.push(wave);
  }
  if (policy === 'survey') entry.survey = takeSurvey(next, next.round);
  next.ledger.push(entry);
  return next;
}

function projectSignal(event, role, knownAt) {
  const sent = event.status === 'sent';
  const direction = sent ? 'outgoing' : event.to === role ? 'incoming' : 'receipt';
  const { wave, policy, edge, from, to, hop, sentAt, arrivesAt, status } = event;
  const view = { wave, policy, edge, from, to, hop, sentAt, arrivesAt, knownAt, status, direction };
  if (sent) return { ...view, strength: event.strength };
  if (direction === 'receipt') return { ...view, reason: event.reason };
  return {
    ...view, reason: event.reason, strength: event.strength, support: event.support,
    score: event.score, threshold: event.threshold,
  };
}

export function observeCouncil(state, role) {
  if (state?.modelVersion !== COUNCIL_MODEL_VERSION) throw new RangeError('模型版本不受支持。');
  if (typeof role !== 'string' || !Object.hasOwn(PROFILES, role)) throw new RangeError('请选择一个有效的生活圈。');

  const relief = surveyRelief(state);
  const circle = state.circles[role];
  const beliefs = Object.fromEntries(POLICIES.map(policy => {
    const threshold = circle.thresholds[policy] - relief;
    const support = circle.support[policy];
    return [policy, { support, threshold, accepts: support >= threshold }];
  }));
  const links = COUNCIL_RULES.edges.filter(edge => edge.from === role || edge.to === role)
    .map(edge => ({ ...edge }));
  const survey = { pending: null, report: null };
  const history = state.ledger.map((entry, index) => {
    if (entry.survey) {
      const { sampledAt, availableAt, samples } = entry.survey;
      if (availableAt <= state.round) survey.report = { sampledAt, availableAt, ...samples[role] };
      else survey.pending = { sampledAt, availableAt };
    }
    const receipts = state.ledger[index - COUNCIL_RULES.signal.receiptDelay]?.signals
      .filter(event => event.status !== 'sent' && event.from === role) ?? [];
    const nearby = entry.signals.filter(event => event.status === 'sent' ? event.from === role : event.to === role);
    const signals = [...receipts, ...nearby].map(event => projectSignal(event, role, entry.round));
    const localChanges = entry.beliefs.filter(change => change.circle === role)
      .map(({ wave, cause, before, after }) => ({ wave, cause, before: { ...before }, after: { ...after } }));
    return {
      round: entry.round, year: entry.year, policy: entry.policy, budget: { ...entry.budget },
      goals: Object.fromEntries(Object.entries(entry.goals).map(([id, values]) => [id, { ...values }])),
      signals, localChanges,
    };
  });
  return { role, round: state.round, year: state.year, relief, beliefs, links, survey, history };
}
