export const HORIZON = 100;
export const BUDGET = 100;
export const MODEL_VERSION = 1;
const FORMAT = 'orbis-atlas/scenario';

export const SECTORS = Object.freeze([
  { id: 'services', name: '服务' },
  { id: 'production', name: '生产' },
  { id: 'ecology', name: '生态' },
]);

export const PATHS = Object.freeze([
  { id: 'baseline', name: '基线', budget: Object.freeze({ services: 35, production: 35, ecology: 30 }) },
  { id: 'a', name: '分支 A', budget: Object.freeze({ services: 50, production: 40, ecology: 10 }) },
  { id: 'b', name: '分支 B', budget: Object.freeze({ services: 25, production: 15, ecology: 60 }) },
]);
export const BRANCHES = Object.freeze(PATHS.slice(1));

const COEFFICIENTS = Object.freeze({
  incomeGrowth: Object.freeze({ base: 0.005, services: 0.006, production: 0.025, ecology: -0.004 }),
  lifeTarget: Object.freeze({ base: 74, services: 24, production: -3, ecology: 8 }),
  lifeAdjustment: 0.024,
  electricCoverage: Object.freeze({ base: 0.01, services: 0.07, production: 0.02 }),
  forestRecovery: Object.freeze({ ecology: 0.032 }),
  forestLoss: Object.freeze({ base: 0.003, production: 0.018 }),
  populationGrowth: Object.freeze({ base: 0.003, services: -0.008, production: 0.006 }),
  urbanization: Object.freeze({ base: 0.002, services: 0.006, production: 0.016 }),
  renewableGrowth: Object.freeze({ base: 0.006, ecology: 0.044 }),
  renewableLoss: Object.freeze({ base: 0.002, production: 0.016 }),
});

const {
  incomeGrowth, lifeTarget, lifeAdjustment, electricCoverage, forestRecovery, forestLoss,
  populationGrowth, urbanization, renewableGrowth, renewableLoss,
} = COEFFICIENTS;

function effect(terms, shares) {
  return Object.entries(terms).reduce((total, [sector, coefficient]) => total + coefficient * shares[sector], 0);
}

function formula(terms) {
  let text = terms.base === undefined ? '' : String(terms.base);
  for (const { id, name } of SECTORS) {
    const coefficient = terms[id];
    if (coefficient === undefined) continue;
    const sign = coefficient < 0 ? ' − ' : text ? ' + ' : '';
    text += `${sign}${Math.abs(coefficient)} × ${name}份额`;
  }
  return text;
}

export const METRICS = Object.freeze([
  {
    id: 'income', name: '人均 GDP', unit: '美元',
    equation: `x × (1 + ${formula(incomeGrowth)})`,
    assumption: '生产与服务提高年增长率，生态支出带来当期成本。模拟沿用起点年美元口径。',
    next: (value, shares) => value * (1 + effect(incomeGrowth, shares)),
  },
  {
    id: 'life', name: '预期寿命', unit: '岁', maximum: 120,
    equation: `x + ${lifeAdjustment} × (${formula(lifeTarget)} − x)`,
    assumption: '寿命逐年向情景目标靠拢，服务提高目标，生产压力压低目标。',
    next: (value, shares) => value + lifeAdjustment * (effect(lifeTarget, shares) - value),
  },
  {
    id: 'electric', name: '通电率', unit: '%', maximum: 100,
    equation: `x + (100 − x) × (${formula(electricCoverage)})`,
    assumption: '服务和生产加快覆盖，扩张发生在尚未通电的份额上。',
    next: (value, shares) => value + (100 - value) * effect(electricCoverage, shares),
  },
  {
    id: 'forest', name: '森林率', unit: '%', maximum: 100,
    equation: `x + (100 − x) × (${formula(forestRecovery)}) − x × (${formula(forestLoss)})`,
    assumption: '生态支出促进非林地恢复，既有森林承受自然损失与生产压力。',
    next: (value, shares) => value + (100 - value) * effect(forestRecovery, shares) - value * effect(forestLoss, shares),
  },
  {
    id: 'pop', name: '人口', unit: '人',
    equation: `x × (1 + ${formula(populationGrowth)})`,
    assumption: '生产提高假定增长率，服务投入通过生育转变降低增长率。',
    next: (value, shares) => value * (1 + effect(populationGrowth, shares)),
  },
  {
    id: 'urban', name: '城市人口占比', unit: '%', maximum: 100,
    equation: `x + (100 − x) × (${formula(urbanization)})`,
    assumption: '生产和服务推动乡村人口转向城镇，增量随剩余乡村份额收窄。',
    next: (value, shares) => value + (100 - value) * effect(urbanization, shares),
  },
  {
    id: 'renew', name: '可再生能源消费占比', unit: '%', maximum: 100,
    equation: `x + (100 − x) × (${formula(renewableGrowth)}) − x × (${formula(renewableLoss)})`,
    assumption: '生态支出加快替代，生产扩张带来的传统能源需求压低占比。',
    next: (value, shares) => value + (100 - value) * effect(renewableGrowth, shares) - value * effect(renewableLoss, shares),
  },
]);

export function readObservation(ctx, country, year) {
  const values = {};
  const codes = {};
  for (const { id } of METRICS) {
    const value = ctx.value(country.id, id, year);
    values[id] = Number.isFinite(value) ? value : null;
    codes[id] = ctx.metrics.find(metric => metric.id === id)?.code ?? '';
  }
  return { countryId: String(country.id), countryName: country.zh || country.name || String(country.id), year, values, codes };
}

function usableValue({ maximum = Infinity }, value) {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}

export function createRun(observation) {
  const start = Object.freeze(Object.fromEntries(METRICS.map(metric => {
    const value = observation.values[metric.id];
    return [metric.id, usableValue(metric, value) ? value : null];
  })));
  return Object.fromEntries(PATHS.map(({ id }) => [id, [start]]));
}

export function allocationTotal(allocation) {
  return SECTORS.reduce((total, { id }) => total + allocation[id], 0);
}

export function validBudgetPoint(value) {
  return Number.isInteger(value) && value >= 0 && value <= BUDGET;
}

export function allocationIssue(allocation) {
  if (!SECTORS.every(({ id }) => validBudgetPoint(allocation?.[id]))) return 'range';
  return allocationTotal(allocation) > BUDGET ? 'budget' : null;
}

export function validForestFloor(value) {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= 100);
}

function advanceValues(previous, allocation) {
  const shares = { base: 1 };
  for (const { id } of SECTORS) shares[id] = allocation[id] / BUDGET;

  return Object.fromEntries(METRICS.map(metric => {
    const value = previous[metric.id];
    const next = value === null ? null : metric.next(value, shares);
    return [metric.id, usableValue(metric, next) ? next : null];
  }));
}

export function advanceRun(run, years, plan) {
  if (!Number.isSafeInteger(years) || years < 1) throw new RangeError('推进年数须为正整数。');
  for (const { id, name } of BRANCHES) {
    if (allocationIssue(plan?.allocations?.[id])) throw new RangeError(`${name}的年度预算无效。`);
  }
  const floor = plan.forestFloor;
  if (!validForestFloor(floor)) throw new RangeError('森林底线须介于 0% 与 100% 之间。');
  const first = run.baseline[0];
  if (!METRICS.some(({ id }) => first[id] !== null)) throw new RangeError('起点缺少可用观测。');
  if (floor !== null && first.forest === null) throw new RangeError('森林底线需要可用的森林率起点。');

  const trajectories = Object.fromEntries(PATHS.map(({ id }) => [id, run[id].slice()]));
  const elapsed = run.baseline.length - 1;
  const limit = Math.min(years, HORIZON - elapsed);
  for (let advanced = 0; advanced < limit; advanced += 1) {
    const candidates = Object.fromEntries(PATHS.map(({ id, budget }) => {
      const allocation = id === 'baseline' ? budget : plan.allocations[id];
      return [id, advanceValues(trajectories[id].at(-1), allocation)];
    }));
    if (floor !== null) {
      const branches = BRANCHES.filter(({ id }) => candidates[id].forest === null || candidates[id].forest < floor)
        .map(({ id, name }) => ({ id, name, forest: candidates[id].forest }));
      if (branches.length) {
        return { trajectories, advanced, blocked: { offset: elapsed + advanced + 1, floor, branches } };
      }
    }
    for (const { id } of PATHS) trajectories[id].push(candidates[id]);
  }
  return { trajectories, advanced: limit, blocked: null };
}

export function replayRun(observation, phases) {
  let trajectories = createRun(observation);
  for (const { years, allocations, forestFloor } of phases) {
    const replay = advanceRun(trajectories, years, { allocations, forestFloor });
    if (replay.advanced !== years) throw new RangeError('推演记录超出百年范围或触及森林底线。');
    trajectories = replay.trajectories;
  }
  return trajectories;
}

export function initialDraft() {
  return {
    allocations: Object.fromEntries(BRANCHES.map(({ id, budget }) => [
      id,
      Object.fromEntries(SECTORS.map(sector => [sector.id, String(budget[sector.id])])),
    ])),
    forestFloor: '',
  };
}

export function encodeExperiment({ observation, phases, draft, cursor }, trajectories) {
  const file = { format: FORMAT, modelVersion: MODEL_VERSION, observation, phases, draft, cursor };
  if (trajectories) {
    file.assumptions = {
      horizon: HORIZON,
      annualBudget: BUDGET,
      baselineBudget: PATHS[0].budget,
      coefficients: COEFFICIENTS,
      metrics: METRICS.map(({ id, name, unit, equation, assumption }) => ({ id, name, unit, equation, assumption })),
    };
    file.simulation = Object.fromEntries(PATHS.map(({ id }) => [
      id,
      trajectories[id].slice(1).map((values, index) => ({ year: observation.year + index + 1, ...values })),
    ]));
  }
  return file;
}

function storedObservation(source) {
  if (
    typeof source?.countryId !== 'string' || !source.countryId ||
    typeof source.countryName !== 'string' ||
    !Number.isSafeInteger(source.year) ||
    !METRICS.every(({ id }) => source.values?.[id] === null || Number.isFinite(source.values?.[id]))
  ) throw new TypeError('存档的起点观测无效。');
  const values = Object.fromEntries(METRICS.map(({ id }) => [id, source.values[id]]));
  const codes = Object.fromEntries(METRICS.map(({ id }) => [
    id, typeof source.codes?.[id] === 'string' ? source.codes[id] : '',
  ]));
  return { countryId: source.countryId, countryName: source.countryName, year: source.year, values, codes };
}

function mapAllocations(allocations, transform) {
  return Object.fromEntries(BRANCHES.map(branch => [
    branch.id, Object.fromEntries(SECTORS.map(sector => [
      sector.id, transform(allocations?.[branch.id]?.[sector.id]),
    ])),
  ]));
}

function storedDraftValue(value) {
  if (typeof value !== 'string' || (value !== '' && !/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(value))) {
    throw new TypeError('存档的预算或底线草稿无效。');
  }
  return value;
}

export function decodeExperiment(file) {
  if (file?.format !== FORMAT || file.modelVersion !== MODEL_VERSION) {
    throw new TypeError('此文件的实验存档格式或模型版本无法读取。');
  }
  const observation = storedObservation(file.observation);
  if (!Array.isArray(file.phases) || file.phases.length > HORIZON) throw new TypeError('存档的推演记录无效。');

  const phases = file.phases.map(phase => {
    if (!Number.isInteger(phase?.years) || phase.years < 1 || phase.years > HORIZON) {
      throw new RangeError('存档的阶段年数无效。');
    }
    return {
      years: phase.years,
      allocations: mapAllocations(phase.allocations, value => value),
      forestFloor: phase.forestFloor,
    };
  });
  const trajectories = replayRun(observation, phases);
  if (!Number.isInteger(file.cursor) || file.cursor < 0 || file.cursor >= trajectories.baseline.length) {
    throw new RangeError('存档的查看年份超出推演范围。');
  }
  const draft = {
    allocations: mapAllocations(file.draft?.allocations, storedDraftValue),
    forestFloor: storedDraftValue(file.draft?.forestFloor),
  };
  return { state: { observation, phases, cursor: file.cursor, draft }, trajectories };
}
