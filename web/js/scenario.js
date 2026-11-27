import {
  BUDGET, HORIZON, MODEL_VERSION, METRICS, PATHS, BRANCHES, SECTORS,
  advanceRun, allocationIssue, allocationTotal, createRun, decodeExperiment, encodeExperiment,
  initialDraft, readObservation, replayRun, validBudgetPoint, validForestFloor,
} from './sim-model.js';

const STORAGE_KEY = 'orbis-atlas.scenario.v1';
const STYLESHEET = new URL('../scenario.css', import.meta.url).href;
const SVG_NS = 'http://www.w3.org/2000/svg';
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const precise = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 21 });
let instance = 0;

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgElement(document, tag, attributes, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function installStyles(document) {
  if (Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => link.href === STYLESHEET)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLESHEET;
  document.head.append(link);
}

function budgetDescription(allocation) {
  return SECTORS.map(({ id, name }) => `${name} ${allocation[id]}`).join(' / ');
}

function unitLabel(metric) {
  return metric.id === 'income' ? '起点年美元' : metric.unit;
}

function displayValue(metric, value) {
  return (metric.id === 'pop' ? compact : number).format(value);
}

function withUnit(value, unit) {
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}

function budgetPanel(path, prefix) {
  return `<fieldset class="oas-budget" data-branch="${path.id}">
    <legend>${path.name}</legend>
    <div class="oas-sector-inputs">${SECTORS.map(({ id, name }) => `
      <label data-sector="${id}">${name}
        <input type="number" name="${path.id}-${id}" min="0" max="${BUDGET}" step="1"
          inputmode="numeric" aria-describedby="${prefix}-${path.id}-budget">
      </label>`).join('')}
    </div>
    <div class="oas-budget-track" aria-hidden="true">${SECTORS.map(({ id }) => `<span data-sector="${id}"></span>`).join('')}</div>
    <p class="oas-note" id="${prefix}-${path.id}-budget" role="status"></p>
  </fieldset>`;
}

function panelMarkup(prefix) {
  return `<section class="oas-panel" aria-label="观测起点">
    <div class="oas-heading">
      <h3>观测起点</h3>
      <p class="oas-context" data-role="origin"></p>
    </div>
    <div class="oas-origin-controls">
      <label>起点国家<select name="country"></select></label>
      <label>起点年份<select name="year"></select></label>
      <button type="button" data-action="adopt">采用起点</button>
    </div>
    <p class="oas-note" data-role="origin-change" role="status"></p>
    <dl class="oas-observations" data-role="observations"></dl>
    <p class="oas-note" data-role="origin-note"></p>
  </section>
  <section class="oas-panel" aria-label="年度方案">
    <div class="oas-heading">
      <h3>年度方案</h3>
      <p class="oas-context">每条路线每年 ${BUDGET} 点，结余归零。</p>
    </div>
    <p class="oas-note">基线固定为${budgetDescription(PATHS[0].budget)}。修改预算后，从下一推演年生效。</p>
    <div class="oas-budget-grid">${BRANCHES.map(path => budgetPanel(path, prefix)).join('')}</div>
    <div class="oas-floor">
      <label>森林底线（%）
        <input type="number" name="forest-floor" min="0" max="100" step="any" inputmode="decimal"
          placeholder="可留空" aria-describedby="${prefix}-floor-help ${prefix}-floor-error">
      </label>
      <p class="oas-note" id="${prefix}-floor-help">任一分支的年末森林率低于底线，三条路线停在上一年。基线仅作对照。</p>
      <p class="oas-note oas-error" id="${prefix}-floor-error" data-role="floor-error" role="status"></p>
    </div>
    <div class="oas-actions">
      <button type="button" data-advance="1">推进 1 年</button>
      <button type="button" data-advance="10">推进 10 年</button>
      <button type="button" class="oas-primary" data-advance="${HORIZON}">推演至百年</button>
    </div>
    <p class="oas-advance-status" data-role="advance-status" role="status"></p>
  </section>
  <section class="oas-panel" aria-label="百年对照">
    <div class="oas-heading">
      <h3>百年对照</h3>
      <p class="oas-context" data-role="progress"></p>
    </div>
    <div class="oas-timeline">
      <div class="oas-timeline-label">
        <label for="${prefix}-timeline">查看年份</label>
        <span data-role="view-year"></span>
      </div>
      <input type="range" id="${prefix}-timeline" name="timeline" min="0" max="0" value="0" step="1">
      <div class="oas-timeline-label oas-note">
        <span data-role="timeline-start"></span><span data-role="timeline-end"></span>
      </div>
    </div>
    <ul class="oas-legend" aria-label="图例">
      <li><i class="oas-origin-mark" aria-hidden="true"></i><span data-role="legend-origin"></span></li>
      ${PATHS.map(({ id, name }) => `<li><i class="oas-line-mark" data-path="${id}" aria-hidden="true"></i>${name}</li>`).join('')}
      <li><i class="oas-future-mark" aria-hidden="true"></i>待推进</li>
    </ul>
    <p class="oas-note">曲线是情景模拟。分支差值按同年基线计算。</p>
    <div class="oas-charts" data-role="charts"></div>
    <div class="oas-actions oas-file-actions">
      <button type="button" data-action="replay">复演到起点</button>
      <button type="button" data-action="export">导出 JSON</button>
      <button type="button" data-action="import">导入复演</button>
      <button type="button" data-action="reset">清空轨迹</button>
      <input type="file" name="import" accept=".json,application/json" hidden>
    </div>
    <p class="oas-note" data-role="file-status" role="status"></p>
    <p class="oas-note" data-role="storage-status" role="status"></p>
  </section>
  <details class="oas-details">
    <summary>年度方案记录 <span data-role="phase-count"></span></summary>
    <div class="oas-details-body" data-role="phases"></div>
  </details>
  <details class="oas-details">
    <summary>观测来源与模型系数</summary>
    <div class="oas-details-body">
      <p>地图观测取自所选国家和精确年份。起点缺失的指标保持空值，观测超出公式取值范围时仅展示原值。</p>
      <p>模型 v${MODEL_VERSION} 逐年计算。公式中的 x 是上年数值，份额为投入点数 ÷ ${BUDGET}。占比按 0–100 计，寿命输入范围为 0–120 岁，其余输入取非负值。人均 GDP 观测采用现价美元，后续模拟沿用起点年美元口径，省略通胀和汇率变化。</p>
      <p>系数是各国通用的思想实验设定。即使推演年份与已有历史年份重合，曲线也使用同一套情景公式。底线用未舍入的年末数值判断。</p>
      <dl class="oas-formulas" data-role="formulas"></dl>
    </div>
  </details>`;
}

function chartDomain(metric, values) {
  if (metric.maximum === 100) return [0, 100];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = (high - low) * 0.1 || Math.max(high * 0.06, 1);
  return [Math.max(0, low - padding), Math.min(metric.maximum ?? Number.MAX_VALUE, high + padding)];
}

function drawPlot(document, metric, paths, year) {
  const width = 328;
  const height = 121;
  const left = 47;
  const right = 307;
  const top = 12;
  const bottom = 94;
  const [low, high] = chartDomain(metric, Object.values(paths).flat().filter(value => value !== null));
  const x = offset => left + (right - left) * offset / HORIZON;
  const y = value => bottom - (value - low) / (high - low) * (bottom - top);
  const lastX = x(paths.baseline.length - 1);
  const svg = svgElement(document, 'svg', {
    class: 'oas-plot', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false',
  });
  svg.append(svgElement(document, 'rect', {
    class: 'oas-plot-future', x: lastX, y: top, width: right - lastX, height: bottom - top,
  }));
  for (const index of [0, 1, 2]) {
    const tick = low + (high - low) * (index / 2);
    const tickY = y(tick);
    svg.append(svgElement(document, 'line', { class: 'oas-grid-line', x1: left, x2: right, y1: tickY, y2: tickY }));
    svg.append(svgElement(document, 'text', { x: left - 7, y: tickY, 'text-anchor': 'end', dy: '0.32em' }, compact.format(tick)));
  }
  for (const offset of [0, 25, 50, 75, HORIZON]) {
    const tickX = x(offset);
    svg.append(svgElement(document, 'line', { class: 'oas-grid-line', x1: tickX, x2: tickX, y1: top, y2: bottom }));
    svg.append(svgElement(document, 'text', { x: tickX, y: 113, 'text-anchor': 'middle' }, year + offset));
  }
  for (const { id } of PATHS) {
    const values = paths[id];
    const points = [];
    for (const [offset, value] of values.entries()) {
      if (value === null) continue;
      const command = offset === 0 || values[offset - 1] === null ? 'M' : 'L';
      points.push(`${command}${x(offset).toFixed(2)},${y(value).toFixed(2)}`);
    }
    svg.append(svgElement(document, 'path', { class: 'oas-curve', 'data-path': id, d: points.join(' ') }));
  }
  const cursor = svgElement(document, 'line', { class: 'oas-chart-cursor', y1: top, y2: bottom });
  svg.append(cursor);
  const dots = PATHS.map(({ id }) => svgElement(document, 'circle', { class: 'oas-chart-dot', 'data-path': id, r: 3 }));
  svg.append(...dots);
  svg.append(svgElement(document, 'circle', {
    class: 'oas-chart-origin', cx: x(0), cy: y(paths.baseline[0]), r: 4,
  }));
  return {
    svg,
    move(offset) {
      const cursorX = x(offset);
      cursor.setAttribute('x1', cursorX);
      cursor.setAttribute('x2', cursorX);
      cursor.style.display = offset === 0 ? 'none' : '';
      for (const [index, { id }] of PATHS.entries()) {
        const value = paths[id][offset];
        const dot = dots[index];
        dot.style.display = offset === 0 || value === null ? 'none' : '';
        if (value === null) continue;
        dot.setAttribute('cx', cursorX);
        dot.setAttribute('cy', y(value));
      }
    },
  };
}

function chartCard(document, metric, observation, trajectories) {
  const card = element(document, 'article', 'oas-chart');
  const heading = element(document, 'div', 'oas-chart-heading');
  heading.append(element(document, 'h4', '', metric.name), element(document, 'span', 'oas-unit', unitLabel(metric)));
  card.append(heading);
  const observed = trajectories.baseline[0][metric.id];
  if (observed === null) {
    const reason = observation.values[metric.id] === null ? '起点缺少该年观测' : '观测超出模型取值范围';
    card.append(element(document, 'p', 'oas-chart-empty', reason));
    return { card, update() {} };
  }

  const paths = Object.fromEntries(PATHS.map(({ id }) => [id, trajectories[id].map(row => row[metric.id])]));
  const plot = drawPlot(document, metric, paths, observation.year);
  const origin = element(document, 'p', 'oas-chart-observed', `共用起点 ${displayValue(metric, observed)}`);
  const values = element(document, 'dl', 'oas-compare-values');
  const readouts = PATHS.map(({ id, name }) => {
    const group = element(document, 'div');
    const value = element(document, 'dd');
    const change = element(document, 'span', 'oas-delta');
    group.dataset.path = id;
    group.append(element(document, 'dt', '', name), value);
    value.append(change);
    values.append(group);
    return { value, change };
  });
  card.append(plot.svg, origin, values);
  return {
    card,
    update(offset) {
      plot.move(offset);
      origin.hidden = offset > 0;
      values.hidden = offset === 0;
      if (offset === 0) return;
      const baseline = paths.baseline[offset];
      for (const [index, { id }] of PATHS.entries()) {
        const value = paths[id][offset];
        const readout = readouts[index];
        readout.value.textContent = value === null ? '—' : displayValue(metric, value);
        if (id === 'baseline' || value === null || baseline === null) continue;
        const delta = value - baseline;
        const magnitude = displayValue(metric, Math.abs(delta));
        const signed = magnitude === '0' ? (delta === 0 ? '0' : '≈0') : `${delta > 0 ? '+' : '−'}${magnitude}`;
        readout.change.textContent = metric.unit === '%' ? `${signed} 百分点` : signed;
        readout.value.append(readout.change);
      }
    },
  };
}

function draftNumber(value) {
  return value === '' ? NaN : Number(value);
}

export function renderScenario(host, ctx) {
  const document = host.ownerDocument;
  const browser = document.defaultView;
  installStyles(document);
  const root = element(document, 'div', 'oa-scenario');
  root.lang = 'zh-CN';
  host.replaceChildren(root);

  const countries = new Map(ctx.countries.map(country => [String(country.id), country]));
  const years = new Set(ctx.years);
  if (!countries.size || !years.size) {
    root.append(element(document, 'p', 'oas-note', '地图暂未提供可选国家或起点年份。'));
    return;
  }
  const countryOptions = Array.from(countries.values()).sort((first, second) =>
    (first.zh || first.name).localeCompare(second.zh || second.name, 'zh-Hans'));
  const yearOptions = Array.from(years).sort((first, second) => second - first);
  const defaultCountry = countries.get(String(ctx.country?.id)) ?? ctx.countries[0];
  const defaultYear = years.has(ctx.year) ? ctx.year : yearOptions[0];

  root.innerHTML = panelMarkup(`oas-${++instance}`);
  const role = name => root.querySelector(`[data-role="${name}"]`);
  const field = name => root.querySelector(`[name="${name}"]`);
  const action = name => root.querySelector(`[data-action="${name}"]`);
  const branchControls = Object.fromEntries(BRANCHES.map(({ id }) => {
    const panel = root.querySelector(`[data-branch="${id}"]`);
    return [id, {
      fields: Object.fromEntries(SECTORS.map(sector => [sector.id, field(`${id}-${sector.id}`)])),
      bar: panel.querySelectorAll('.oas-budget-track span'),
      status: panel.querySelector('[role="status"]'),
    }];
  }));
  const advanceButtons = root.querySelectorAll('[data-advance]');
  const countryField = field('country');
  const yearField = field('year');
  const floorField = field('forest-floor');
  const timeline = field('timeline');
  const upload = field('import');
  const storageStatus = role('storage-status');

  let storage;
  let state;
  let trajectories;
  let verified = true;
  let charts = [];
  let importRequest = 0;

  function matchesMap(observation) {
    const country = countries.get(observation.countryId);
    if (!country || !years.has(observation.year)) return false;
    const current = readObservation(ctx, country, observation.year);
    return current.countryName === observation.countryName &&
      METRICS.every(({ id }) => current.values[id] === observation.values[id] && current.codes[id] === observation.codes[id]);
  }

  try {
    storage = browser.localStorage;
    const saved = storage.getItem(STORAGE_KEY);
    if (saved) {
      const restored = decodeExperiment(JSON.parse(saved));
      verified = matchesMap(restored.state.observation);
      ({ state, trajectories } = restored);
    }
  } catch {
    storageStatus.textContent = storage
      ? '本地存档读取失败。已载入当前地图起点。'
      : '浏览器本地保存不可用，可导出 JSON 保留进度。';
  }
  if (!state) {
    const observation = readObservation(ctx, defaultCountry, defaultYear);
    state = { observation, draft: initialDraft(), phases: [], cursor: 0 };
    trajectories = createRun(observation);
  }

  function save() {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(encodeExperiment(state)));
      storageStatus.textContent = '';
    } catch {
      storageStatus.textContent = '浏览器本地保存失败，可导出 JSON 保留进度。';
    }
  }

  function elapsed() {
    return trajectories.baseline.length - 1;
  }

  function selectionChanged() {
    return countryField.value !== state.observation.countryId || Number(yearField.value) !== state.observation.year;
  }

  function renderOriginControls() {
    const { observation, draft } = state;
    const options = countryOptions.map(country => {
      const option = element(document, 'option', '', country.zh || country.name);
      option.value = String(country.id);
      return option;
    });
    if (!countries.has(observation.countryId)) {
      const archived = element(document, 'option', '', `${observation.countryName}（存档）`);
      archived.value = observation.countryId;
      options.push(archived);
    }
    countryField.replaceChildren(...options);
    countryField.value = observation.countryId;

    const yearsToShow = years.has(observation.year) ? yearOptions : [...yearOptions, observation.year];
    yearField.replaceChildren(...yearsToShow.map(year => {
      const option = element(document, 'option', '', years.has(year) ? String(year) : `${year}（存档）`);
      option.value = year;
      return option;
    }));
    yearField.value = observation.year;

    for (const { id } of BRANCHES) {
      for (const sector of SECTORS) branchControls[id].fields[sector.id].value = draft.allocations[id][sector.id];
    }
    floorField.value = draft.forestFloor;
  }

  function renderObservation() {
    const { observation } = state;
    const source = verified ? '地图原始观测' : '存档输入';
    role('origin').textContent = `${observation.countryName} · ${observation.year} 年 · ${source}`;
    role('legend-origin').textContent = verified ? '观测起点' : '存档起点';
    const readings = METRICS.map(metric => {
      const group = element(document, 'div', 'oas-reading');
      const value = observation.values[metric.id];
      const usable = trajectories.baseline[0][metric.id] !== null;
      const title = element(document, 'dt', '', metric.name);
      const reading = element(document, 'dd', '', value === null ? '缺失' : withUnit(displayValue(metric, value), metric.unit));
      if (value !== null) reading.title = withUnit(precise.format(value), metric.unit);
      if (!usable) reading.classList.add('oas-muted');
      group.append(title, reading);
      return group;
    });
    role('observations').replaceChildren(...readings);
    role('origin-note').textContent = verified
      ? '只取该年原始记录。显示值经格式化，推演使用原始精度。'
      : '此快照与当前地图观测无法核对一致，复演使用存档中的原始输入。';

    role('formulas').replaceChildren(...METRICS.map(metric => {
      const group = element(document, 'div');
      const code = observation.codes[metric.id];
      const title = element(document, 'dt', '', metric.name);
      if (code) title.append(element(document, 'code', '', code));
      const calculation = element(document, 'dd');
      calculation.append(element(document, 'p', 'oas-equation', metric.equation), element(document, 'p', '', metric.assumption));
      group.append(title, calculation);
      return group;
    }));
  }

  function planFromFields() {
    const allocations = Object.fromEntries(BRANCHES.map(({ id }) => [
      id, Object.fromEntries(SECTORS.map(sector => [sector.id, draftNumber(state.draft.allocations[id][sector.id])])),
    ]));
    const forestFloor = floorField.validity.badInput ? NaN : state.draft.forestFloor === '' ? null : Number(state.draft.forestFloor);
    return { allocations, forestFloor };
  }

  function renderPlan() {
    const plan = planFromFields();
    let hasBudgetError = false;
    for (const { id } of BRANCHES) {
      const controls = branchControls[id];
      const allocation = plan.allocations[id];
      const issue = allocationIssue(allocation);
      hasBudgetError ||= Boolean(issue);
      const total = issue === 'range' ? 0 : allocationTotal(allocation);
      controls.status.classList.toggle('oas-error', Boolean(issue));
      controls.status.textContent = issue === 'range' ? `每项须填写 0–${BUDGET} 的整数。`
        : issue === 'budget' ? `超出预算 ${total - BUDGET} 点，须削减投入。`
          : `已分配 ${total} / ${BUDGET} 点 · 结余 ${BUDGET - total} 点`;
      for (const [index, sector] of SECTORS.entries()) {
        const point = allocation[sector.id];
        const valid = validBudgetPoint(point);
        controls.fields[sector.id].setAttribute('aria-invalid', String(!valid || issue === 'budget'));
        controls.bar[index].style.width = `${valid ? point / Math.max(BUDGET, total) * 100 : 0}%`;
      }
    }

    const start = trajectories.baseline[0];
    const floorError = !validForestFloor(plan.forestFloor) ? '森林底线须填写 0–100 之间的数值。'
      : plan.forestFloor !== null && start.forest === null ? '森林底线需要可用的森林率起点。' : '';
    floorField.setAttribute('aria-invalid', String(Boolean(floorError)));
    role('floor-error').textContent = floorError;

    const pending = selectionChanged();
    const canAdopt = countries.has(countryField.value) && years.has(Number(yearField.value));
    action('adopt').disabled = !canAdopt || (!pending && verified);
    role('origin-change').textContent = pending && !canAdopt ? '请选择地图中可用的国家和年份。'
      : pending ? (elapsed() ? '采用新起点将清空当前轨迹。' : '采用所选起点后可推进。')
        : !verified && canAdopt ? '采用地图起点将以当前观测重新开始。' : '';

    const hasInput = METRICS.some(({ id }) => start[id] !== null);
    for (const button of advanceButtons) {
      button.disabled = pending || !hasInput || hasBudgetError || Boolean(floorError) || elapsed() >= HORIZON;
    }
    const tenYear = root.querySelector('[data-advance="10"]');
    const remaining = HORIZON - elapsed();
    tenYear.textContent = `推进 ${Math.min(10, remaining || 10)} 年`;
    return hasInput ? (elapsed() === HORIZON ? '已到百年终点。' : '')
      : '此起点缺少可用于推演的观测。请选择其他国家或年份。';
  }

  function renderPhases() {
    const phases = role('phases');
    role('phase-count').textContent = `${state.phases.length} 段`;
    if (!state.phases.length) {
      phases.replaceChildren(element(document, 'p', 'oas-note', '推进后会在这里列出各阶段的年度预算和森林底线。'));
      return;
    }
    const list = element(document, 'ol', 'oas-phase-list');
    let year = state.observation.year + 1;
    for (const phase of state.phases) {
      const lastYear = year + phase.years - 1;
      const title = year === lastYear ? `${year} 年` : `${year}–${lastYear} 年`;
      const entry = element(document, 'li');
      entry.append(element(document, 'strong', '', title));
      for (const { id, name } of BRANCHES) {
        entry.append(element(document, 'span', '', `${name} · ${budgetDescription(phase.allocations[id])}`));
      }
      const floor = phase.forestFloor === null ? '底线关闭' : `底线 ${precise.format(phase.forestFloor)}%`;
      entry.append(element(document, 'span', '', floor));
      list.append(entry);
      year = lastYear + 1;
    }
    phases.replaceChildren(list);
  }

  function renderCursor() {
    const year = state.observation.year + state.cursor;
    const kind = state.cursor > 0 ? '模拟' : verified ? '观测' : '存档输入';
    role('view-year').textContent = `${year} 年 · ${kind}`;
    timeline.value = state.cursor;
    timeline.setAttribute('aria-valuetext', `${year} 年，${kind}`);
    for (const chart of charts) chart.update(state.cursor);
  }

  function renderTrajectories() {
    const { observation } = state;
    const progress = elapsed();
    role('progress').textContent = `已推进 ${progress} / ${HORIZON} 年`;
    role('timeline-start').textContent = `${observation.year} 年起点`;
    role('timeline-end').textContent = progress ? `${observation.year + progress} 年已推进` : '推进后可查看逐年结果';
    timeline.max = progress;
    timeline.disabled = progress === 0;
    action('reset').disabled = progress === 0;
    action('replay').disabled = progress === 0;
    charts = METRICS.map(metric => chartCard(document, metric, observation, trajectories));
    role('charts').replaceChildren(...charts.map(({ card }) => card));
    renderCursor();
    renderPhases();
  }

  function setAdvanceMessage(text, error = false) {
    const status = role('advance-status');
    status.textContent = text;
    status.classList.toggle('oas-error', error);
  }

  function refreshExperiment() {
    renderOriginControls();
    renderObservation();
    renderTrajectories();
    setAdvanceMessage(renderPlan());
  }

  function advance(amount) {
    const plan = planFromFields();
    const result = advanceRun(trajectories, amount, plan);
    if (result.advanced) {
      trajectories = result.trajectories;
      state.phases.push({ years: result.advanced, ...plan });
      state.cursor = elapsed();
      renderTrajectories();
      save();
    }
    const status = renderPlan();
    if (result.blocked) {
      const { offset, floor, branches } = result.blocked;
      const year = state.observation.year + offset;
      const cause = branches.map(({ name, forest }) => {
        const rounded = number.format(forest);
        const shown = Number(rounded) < floor ? rounded : precise.format(forest);
        return `${name} ${shown}%`;
      }).join('、');
      setAdvanceMessage(`${year} 年被底线阻止。${cause}低于 ${precise.format(floor)}%，轨迹停在 ${year - 1} 年。`, true);
    } else {
      setAdvanceMessage(status || `已推进至 ${state.observation.year + elapsed()} 年。`);
    }
  }

  refreshExperiment();
  for (const control of [countryField, yearField]) {
    control.addEventListener('change', () => setAdvanceMessage(renderPlan()));
  }
  action('adopt').addEventListener('click', () => {
    const observation = readObservation(ctx, countries.get(countryField.value), Number(yearField.value));
    state = { ...state, observation, phases: [], cursor: 0 };
    verified = true;
    trajectories = createRun(observation);
    refreshExperiment();
    save();
  });
  for (const { id } of BRANCHES) {
    for (const sector of SECTORS) {
      branchControls[id].fields[sector.id].addEventListener('input', event => {
        state.draft.allocations[id][sector.id] = event.currentTarget.value;
        setAdvanceMessage(renderPlan());
        save();
      });
    }
  }
  floorField.addEventListener('input', () => {
    state.draft.forestFloor = floorField.value;
    setAdvanceMessage(renderPlan());
    save();
  });
  for (const button of advanceButtons) button.addEventListener('click', () => advance(Number(button.dataset.advance)));

  timeline.addEventListener('input', () => {
    state.cursor = Number(timeline.value);
    renderCursor();
    save();
  });
  action('replay').addEventListener('click', () => {
    trajectories = replayRun(state.observation, state.phases);
    state.cursor = 0;
    renderTrajectories();
    save();
    role('file-status').textContent = '已按年度方案记录复演。拖动年份可查看结果。';
  });
  action('reset').addEventListener('click', () => {
    state = { ...state, phases: [], cursor: 0 };
    trajectories = createRun(state.observation);
    renderTrajectories();
    setAdvanceMessage(renderPlan());
    save();
    role('file-status').textContent = '已清空轨迹。可以从当前起点重新推进。';
  });
  action('export').addEventListener('click', () => {
    const payload = encodeExperiment(state, trajectories);
    payload.originVerification = verified ? 'matches-map' : 'archived-input';
    const blob = new browser.Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = browser.URL.createObjectURL(blob);
    const anchor = element(document, 'a');
    anchor.href = url;
    const filenameId = state.observation.countryId.replace(/[^a-z0-9_-]/gi, '_');
    anchor.download = `orbis-scenario-${filenameId}-${state.observation.year}.json`;
    anchor.hidden = true;
    root.append(anchor);
    anchor.click();
    anchor.remove();
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 1000);
    role('file-status').textContent = '已生成 JSON，包含起点、模型系数、年度方案和逐年结果。';
  });
  action('import').addEventListener('click', () => upload.click());
  upload.addEventListener('change', async () => {
    const file = upload.files[0];
    upload.value = '';
    if (!file) return;
    const request = ++importRequest;
    const connected = root.isConnected;
    try {
      const restored = decodeExperiment(JSON.parse(await file.text()));
      if (request !== importRequest || (connected && !root.isConnected)) return;
      verified = matchesMap(restored.state.observation);
      ({ state, trajectories } = restored);
      refreshExperiment();
      save();
      role('file-status').textContent = '已导入并按存档方案复演。';
    } catch {
      if (request === importRequest) {
        role('file-status').textContent = '导入失败。请使用此版本实验室导出的有效 JSON。';
      }
    }
  });
}
