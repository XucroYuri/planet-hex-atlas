import {
  BUDGET, HORIZON, MODEL_VERSION, METRICS, PATHS, BRANCHES, SECTORS,
  advanceRun, allocationIssue, allocationTotal, createRun, decodeExperiment, encodeExperiment,
  equationLabel, initialDraft, readObservation, replayRun, validBudgetPoint, validForestFloor,
} from './sim-model.js';
import { formatCount, formatPercent, formatYear, getLocale, htmlText, msg, numberFormat, yearLabel } from './i18n.js';
import { countryName } from './i18n-places.js';

const STORAGE_KEY = 'orbis-atlas.scenario.v1';
const STYLESHEET = new URL('../scenario.css', import.meta.url).href;
const SVG_NS = 'http://www.w3.org/2000/svg';
const number = numberFormat({ maximumFractionDigits: 2 });
const compact = numberFormat({ notation: 'compact', maximumFractionDigits: 1 });
const signedNumber = numberFormat({ maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const signedCompact = numberFormat({ notation: 'compact', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const precise = numberFormat({ maximumSignificantDigits: 21 });
const precisePercent = numberFormat({ style: 'percent', maximumSignificantDigits: 21 });
const countryOrder = new Intl.Collator(getLocale());
const listFormat = new Intl.ListFormat(getLocale());
const advanceText = (years) => msg('推进 {years} 年', { years: formatCount(years) });
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
  return SECTORS.map(({ id, name }) => `${msg(name)} ${formatCount(allocation[id])}`).join(' / ');
}

function unitLabel(metric) {
  return msg(metric.id === 'income' ? '起点年美元' : metric.unit);
}

function displayValue(metric, value) {
  return (metric.id === 'pop' ? compact : number).format(value);
}

function withUnit(metric, value, exact = false) {
  if (metric.unit === '%') return exact ? precisePercent.format(value / 100) : formatPercent(value);
  return `${exact ? precise.format(value) : displayValue(metric, value)} ${msg(metric.unit)}`;
}

function budgetPanel(path, prefix) {
  return `<fieldset class="oas-budget" data-branch="${path.id}">
    <legend>${htmlText(path.name)}</legend>
    <div class="oas-sector-inputs">${SECTORS.map(({ id, name }) => `
      <label data-sector="${id}">${htmlText(name)}
        <input type="number" name="${path.id}-${id}" min="0" max="${BUDGET}" step="1"
          inputmode="numeric" aria-describedby="${prefix}-${path.id}-budget">
      </label>`).join('')}
    </div>
    <div class="oas-budget-track" aria-hidden="true">${SECTORS.map(({ id }) => `<span data-sector="${id}"></span>`).join('')}</div>
    <p class="oas-note" id="${prefix}-${path.id}-budget" role="status"></p>
  </fieldset>`;
}

function panelMarkup(prefix) {
  return `<section class="oas-panel" aria-label="${htmlText('观测起点')}">
    <div class="oas-heading">
      <h3>${htmlText('观测起点')}</h3>
      <p class="oas-context" data-role="origin"></p>
    </div>
    <div class="oas-origin-controls">
      <label>${htmlText('起点国家')}<select name="country"></select></label>
      <label>${htmlText('起点年份')}<select name="year"></select></label>
      <button type="button" data-action="adopt">${htmlText('采用起点')}</button>
    </div>
    <p class="oas-note" data-role="origin-change" role="status"></p>
    <dl class="oas-observations" data-role="observations"></dl>
    <p class="oas-note" data-role="origin-note"></p>
  </section>
  <section class="oas-panel" aria-label="${htmlText('年度方案')}">
    <div class="oas-heading">
      <h3>${htmlText('年度方案')}</h3>
      <p class="oas-context">${htmlText('每条路线每年 {budget} 点，结余归零。', { budget: formatCount(BUDGET) })}</p>
    </div>
    <p class="oas-note">${htmlText('基线固定为{budget}。修改预算后，从下一推演年生效。', { budget: budgetDescription(PATHS[0].budget) })}</p>
    <div class="oas-budget-grid">${BRANCHES.map(path => budgetPanel(path, prefix)).join('')}</div>
    <div class="oas-floor">
      <label>${htmlText('森林底线（%）')}
        <input type="number" name="forest-floor" min="0" max="100" step="any" inputmode="decimal"
          placeholder="${htmlText('可留空')}" aria-describedby="${prefix}-floor-help ${prefix}-floor-error">
      </label>
      <p class="oas-note" id="${prefix}-floor-help">${htmlText('任一分支的年末森林率低于底线，三条路线停在上一年。基线仅作对照。')}</p>
      <p class="oas-note oas-error" id="${prefix}-floor-error" data-role="floor-error" role="status"></p>
    </div>
    <div class="oas-actions">
      <button type="button" data-advance="1">${htmlText('推进 1 年')}</button>
      <button type="button" data-advance="10">${htmlText('推进 {years} 年', { years: formatCount(10) })}</button>
      <button type="button" class="oas-primary" data-advance="${HORIZON}">${htmlText('推演至百年')}</button>
    </div>
    <p class="oas-advance-status" data-role="advance-status" role="status"></p>
  </section>
  <section class="oas-panel" aria-label="${htmlText('百年对照')}">
    <div class="oas-heading">
      <h3>${htmlText('百年对照')}</h3>
      <p class="oas-context" data-role="progress"></p>
    </div>
    <div class="oas-timeline">
      <div class="oas-timeline-label">
        <label for="${prefix}-timeline">${htmlText('查看年份')}</label>
        <span data-role="view-year"></span>
      </div>
      <input type="range" dir="ltr" id="${prefix}-timeline" name="timeline" min="0" max="0" value="0" step="1">
      <div class="oas-timeline-label oas-note" dir="ltr">
        <span data-role="timeline-start" dir="auto"></span><span data-role="timeline-end" dir="auto"></span>
      </div>
    </div>
    <ul class="oas-legend" aria-label="${htmlText('图例')}">
      <li><i class="oas-origin-mark" aria-hidden="true"></i><span data-role="legend-origin"></span></li>
      ${PATHS.map(({ id, name }) => `<li><i class="oas-line-mark" data-path="${id}" aria-hidden="true"></i>${htmlText(name)}</li>`).join('')}
      <li><i class="oas-future-mark" aria-hidden="true"></i>${htmlText('待推进')}</li>
    </ul>
    <p class="oas-note">${htmlText('曲线是情景模拟。分支差值按同年基线计算。')}</p>
    <div class="oas-charts" data-role="charts"></div>
    <div class="oas-actions oas-file-actions">
      <button type="button" data-action="replay">${htmlText('复演到起点')}</button>
      <button type="button" data-action="export">${htmlText('导出 JSON')}</button>
      <button type="button" data-action="import">${htmlText('导入复演')}</button>
      <button type="button" data-action="reset">${htmlText('清空轨迹')}</button>
      <input type="file" name="import" accept=".json,application/json" hidden>
    </div>
    <p class="oas-note" data-role="file-status" role="status"></p>
    <p class="oas-note" data-role="storage-status" role="status"></p>
  </section>
  <details class="oas-details">
    <summary>${htmlText('年度方案记录')} <span data-role="phase-count"></span></summary>
    <div class="oas-details-body" data-role="phases"></div>
  </details>
  <details class="oas-details">
    <summary>${htmlText('观测来源与模型系数')}</summary>
    <div class="oas-details-body">
      <p>${htmlText('地图观测取自所选国家和精确年份。起点缺失的指标保持空值，观测超出公式取值范围时仅展示原值。')}</p>
      <p>${htmlText('模型 v{version} 逐年计算。公式中的 x 是上年数值，份额为投入点数 ÷ {budget}。占比按 0–100 计，寿命输入范围为 0–120 岁，其余输入取非负值。人均 GDP 观测采用现价美元，后续模拟沿用起点年美元口径，省略通胀和汇率变化。', { version: MODEL_VERSION, budget: formatCount(BUDGET) })}</p>
      <p>${htmlText('系数是各国通用的思想实验设定。即使推演年份与已有历史年份重合，曲线也使用同一套情景公式。底线用未舍入的年末数值判断。')}</p>
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
    class: 'oas-plot', viewBox: `0 0 ${width} ${height}`, direction: 'ltr', 'aria-hidden': 'true', focusable: 'false',
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
    svg.append(svgElement(document, 'text', { x: tickX, y: 113, 'text-anchor': 'middle' }, formatYear(year + offset)));
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
  heading.append(element(document, 'h4', '', msg(metric.name)), element(document, 'span', 'oas-unit', unitLabel(metric)));
  card.append(heading);
  const observed = trajectories.baseline[0][metric.id];
  if (observed === null) {
    const reason = msg(observation.values[metric.id] === null ? '起点缺少该年观测' : '观测超出模型取值范围');
    card.append(element(document, 'p', 'oas-chart-empty', reason));
    return { card, update() {} };
  }

  const paths = Object.fromEntries(PATHS.map(({ id }) => [id, trajectories[id].map(row => row[metric.id])]));
  const plot = drawPlot(document, metric, paths, observation.year);
  const origin = element(document, 'p', 'oas-chart-observed', msg('共用起点 {value}', { value: displayValue(metric, observed) }));
  const values = element(document, 'dl', 'oas-compare-values');
  const readouts = PATHS.map(({ id, name }) => {
    const group = element(document, 'div');
    const value = element(document, 'dd');
    const change = element(document, 'span', 'oas-delta');
    group.dataset.path = id;
    group.append(element(document, 'dt', '', msg(name)), value);
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
        const zero = number.format(0);
        const signed = displayValue(metric, Math.abs(delta)) === zero && delta !== 0 ? `≈${zero}`
          : (metric.id === 'pop' ? signedCompact : signedNumber).format(delta);
        readout.change.textContent = metric.unit === '%' ? msg('{delta} 百分点', { delta: signed }) : signed;
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
  root.lang = getLocale();
  host.replaceChildren(root);

  const countries = new Map(ctx.countries.map(country => [String(country.id), country]));
  const years = new Set(ctx.years);
  if (!countries.size || !years.size) {
    root.append(element(document, 'p', 'oas-note', msg('地图暂未提供可选国家或起点年份。')));
    return;
  }
  const countryOptions = Array.from(countries.values()).sort((first, second) =>
    countryOrder.compare(countryName(first), countryName(second)));
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
    storageStatus.textContent = msg(storage
      ? '本地存档读取失败。已载入当前地图起点。'
      : '浏览器本地保存不可用，可导出 JSON 保留进度。');
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
      storageStatus.textContent = msg('浏览器本地保存失败，可导出 JSON 保留进度。');
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
      const option = element(document, 'option', '', countryName(country));
      option.value = String(country.id);
      return option;
    });
    if (!countries.has(observation.countryId)) {
      const archived = element(document, 'option', '', msg('{value}（存档）', { value: observation.countryName }));
      archived.value = observation.countryId;
      options.push(archived);
    }
    countryField.replaceChildren(...options);
    countryField.value = observation.countryId;

    const yearsToShow = years.has(observation.year) ? yearOptions : [...yearOptions, observation.year];
    yearField.replaceChildren(...yearsToShow.map(year => {
      const label = formatYear(year);
      const option = element(document, 'option', '', years.has(year) ? label : msg('{value}（存档）', { value: label }));
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
    const source = msg(verified ? '地图原始观测' : '存档输入');
    const name = countryName(countries.get(observation.countryId)) || observation.countryName;
    role('origin').textContent = `${name} · ${yearLabel(observation.year)} · ${source}`;
    role('legend-origin').textContent = msg(verified ? '观测起点' : '存档起点');
    const readings = METRICS.map(metric => {
      const group = element(document, 'div', 'oas-reading');
      const value = observation.values[metric.id];
      const usable = trajectories.baseline[0][metric.id] !== null;
      const title = element(document, 'dt', '', msg(metric.name));
      const reading = element(document, 'dd', '', value === null ? msg('缺失') : withUnit(metric, value));
      if (value !== null) reading.title = withUnit(metric, value, true);
      if (!usable) reading.classList.add('oas-muted');
      group.append(title, reading);
      return group;
    });
    role('observations').replaceChildren(...readings);
    role('origin-note').textContent = msg(verified
      ? '只取该年原始记录。显示值经格式化，推演使用原始精度。'
      : '此快照与当前地图观测无法核对一致，复演使用存档中的原始输入。');

    role('formulas').replaceChildren(...METRICS.map(metric => {
      const group = element(document, 'div');
      const code = observation.codes[metric.id];
      const title = element(document, 'dt', '', msg(metric.name));
      if (code) title.append(element(document, 'code', '', code));
      const calculation = element(document, 'dd');
      const equation = element(document, 'p', 'oas-equation', equationLabel(metric.equation));
      equation.dir = 'ltr';
      calculation.append(equation, element(document, 'p', '', msg(metric.assumption)));
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
      controls.status.textContent = issue === 'range' ? msg('每项须填写 0–{budget} 的整数。', { budget: formatCount(BUDGET) })
        : issue === 'budget' ? msg('超出预算 {excess} 点，须削减投入。', { excess: formatCount(total - BUDGET) })
          : msg('已分配 {total} / {budget} 点 · 结余 {remaining} 点', {
            total: formatCount(total), budget: formatCount(BUDGET), remaining: formatCount(BUDGET - total),
          });
      for (const [index, sector] of SECTORS.entries()) {
        const point = allocation[sector.id];
        const valid = validBudgetPoint(point);
        controls.fields[sector.id].setAttribute('aria-invalid', String(!valid || issue === 'budget'));
        controls.bar[index].style.width = `${valid ? point / Math.max(BUDGET, total) * 100 : 0}%`;
      }
    }

    const start = trajectories.baseline[0];
    const floorError = msg(!validForestFloor(plan.forestFloor) ? '森林底线须填写 0–100 之间的数值。'
      : plan.forestFloor !== null && start.forest === null ? '森林底线需要可用的森林率起点。' : '');
    floorField.setAttribute('aria-invalid', String(Boolean(floorError)));
    role('floor-error').textContent = floorError;

    const pending = selectionChanged();
    const canAdopt = countries.has(countryField.value) && years.has(Number(yearField.value));
    action('adopt').disabled = !canAdopt || (!pending && verified);
    role('origin-change').textContent = msg(pending && !canAdopt ? '请选择地图中可用的国家和年份。'
      : pending ? (elapsed() ? '采用新起点将清空当前轨迹。' : '采用所选起点后可推进。')
        : !verified && canAdopt ? '采用地图起点将以当前观测重新开始。' : '');

    const hasInput = METRICS.some(({ id }) => start[id] !== null);
    for (const button of advanceButtons) {
      button.disabled = pending || !hasInput || hasBudgetError || Boolean(floorError) || elapsed() >= HORIZON;
    }
    const tenYear = root.querySelector('[data-advance="10"]');
    const remaining = HORIZON - elapsed();
    const step = Math.min(10, remaining || 10);
    tenYear.textContent = step === 1 ? msg('推进 1 年') : advanceText(step);
    return msg(hasInput ? (elapsed() === HORIZON ? '已到百年终点。' : '')
      : '此起点缺少可用于推演的观测。请选择其他国家或年份。');
  }

  function renderPhases() {
    const phases = role('phases');
    role('phase-count').textContent = msg('{count} 段', { count: formatCount(state.phases.length) });
    if (!state.phases.length) {
      phases.replaceChildren(element(document, 'p', 'oas-note', msg('推进后会在这里列出各阶段的年度预算和森林底线。')));
      return;
    }
    const list = element(document, 'ol', 'oas-phase-list');
    let year = state.observation.year + 1;
    for (const phase of state.phases) {
      const lastYear = year + phase.years - 1;
      const title = year === lastYear ? yearLabel(year)
        : msg('{year}–{last} 年', { year: formatYear(year), last: formatYear(lastYear) });
      const entry = element(document, 'li');
      entry.append(element(document, 'strong', '', title));
      for (const { id, name } of BRANCHES) {
        entry.append(element(document, 'span', '', `${msg(name)} · ${budgetDescription(phase.allocations[id])}`));
      }
      const floor = phase.forestFloor === null ? msg('底线关闭')
        : msg('底线 {floor}', { floor: precisePercent.format(phase.forestFloor / 100) });
      entry.append(element(document, 'span', '', floor));
      list.append(entry);
      year = lastYear + 1;
    }
    phases.replaceChildren(list);
  }

  function renderCursor() {
    const year = state.observation.year + state.cursor;
    const kind = msg(state.cursor > 0 ? '模拟' : verified ? '观测' : '存档输入');
    const label = `${yearLabel(year)} · ${kind}`;
    role('view-year').textContent = label;
    timeline.value = state.cursor;
    timeline.setAttribute('aria-valuetext', label);
    for (const chart of charts) chart.update(state.cursor);
  }

  function renderTrajectories() {
    const { observation } = state;
    const progress = elapsed();
    role('progress').textContent = msg('已推进 {progress} / {horizon} 年', { progress: formatCount(progress), horizon: formatCount(HORIZON) });
    role('timeline-start').textContent = msg('{year} 年起点', { year: formatYear(observation.year) });
    role('timeline-end').textContent = progress ? msg('{year} 年已推进', { year: formatYear(observation.year + progress) }) : msg('推进后可查看逐年结果');
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
      const cause = listFormat.format(branches.map(({ name, forest }) => {
        const shown = Math.round(forest * 100) / 100 < floor ? formatPercent(forest) : precisePercent.format(forest / 100);
        return `${msg(name)} ${shown}`;
      }));
      setAdvanceMessage(msg('{year} 年被底线阻止。{cause}低于 {floor}，轨迹停在 {last} 年。', {
        year: formatYear(year), cause, floor: precisePercent.format(floor / 100), last: formatYear(year - 1),
      }), true);
    } else {
      setAdvanceMessage(status || msg('已推进至 {year} 年。', { year: formatYear(state.observation.year + elapsed()) }));
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
    role('file-status').textContent = msg('已按年度方案记录复演。拖动年份可查看结果。');
  });
  action('reset').addEventListener('click', () => {
    state = { ...state, phases: [], cursor: 0 };
    trajectories = createRun(state.observation);
    renderTrajectories();
    setAdvanceMessage(renderPlan());
    save();
    role('file-status').textContent = msg('已清空轨迹。可以从当前起点重新推进。');
  });
  action('export').addEventListener('click', () => {
    const payload = encodeExperiment(state, trajectories);
    payload.originVerification = verified ? 'matches-map' : 'archived-input';
    payload.assumptions.metrics = payload.assumptions.metrics.map((metric) => ({
      ...metric,
      name: msg(metric.name),
      unit: msg(metric.unit),
      equation: equationLabel(metric.equation),
      assumption: msg(metric.assumption),
    }));
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
    role('file-status').textContent = msg('已生成 JSON，包含起点、模型系数、年度方案和逐年结果。');
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
      role('file-status').textContent = msg('已导入并按存档方案复演。');
    } catch {
      if (request === importRequest) {
        role('file-status').textContent = msg('导入失败。请使用此版本实验室导出的有效 JSON。');
      }
    }
  });
}
