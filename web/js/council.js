import { esc } from './data.js';
import {
  advanceCouncil, checkProposal, COUNCIL_RULES, createCouncil, observeCouncil,
} from './council-model.js';

const STYLESHEET = new URL('../council.css', import.meta.url).href;
const { budget, edges, goals, policies, roles, signal, survey } = COUNCIL_RULES;
const BRANCHES = [
  { id: 'a', name: '甲线', opening: 'services' },
  { id: 'b', name: '乙线', opening: 'industry' },
];
const MEASUREMENTS = { pop: '人口', urban: '城镇化率', electric: '通电率' };
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const signed = value => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';

function installStyles(document) {
  if (Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => link.href === STYLESHEET)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLESHEET;
  document.head.append(link);
}

function markup() {
  const routes = BRANCHES.map(({ id, name }) => `<option value="${id}">${name}</option>`).join('');
  const circles = Object.entries(roles).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  const options = Object.entries(policies)
    .map(([id, { name, cost }]) => `<option value="${id}">${name} · ${cost} 点</option>`).join('');
  return `<header class="council-header">
    <div>
      <p>地区和年份确定物质起点。生活圈、初始态度及传播门槛均为游戏假设。</p>
    </div>
    <p class="council-clock" data-view="clock"></p>
  </header>
  <section class="council-sheet" aria-label="观测起点">
    <form class="council-origin">
      <label>地区<select name="region"></select></label>
      <label>起始年份<select name="year"></select></label>
      <label>实验种子<input name="seed" type="text" value="atlas-1" required></label>
      <button type="submit">采用起点</button>
    </form>
    <p class="council-note" data-view="origin"></p>
    <dl class="council-origin-data" data-view="measurements"></dl>
  </section>
  <section class="council-sheet" aria-label="双线议案">
    <div class="council-heading">
      <h3>双线议案</h3>
      <p>两线同步推进。每年补充至多 ${budget.recovery} 点，上限 ${budget.capacity} 点。</p>
    </div>
    <div class="council-branches">${BRANCHES.map(({ id, name }) => `<div class="council-branch" data-branch="${id}">
      <p class="council-balance" data-view="balance-${id}"></p>
      <label>${name}行动<select name="policy-${id}">${options}</select></label>
      <p class="council-note" data-view="effect-${id}"></p>
      <ul class="council-checks" data-view="check-${id}"></ul>
    </div>`).join('')}</div>
    <div class="council-actions">
      <button type="button" class="council-primary" data-action="advance">推进 1 年</button>
      <button type="button" data-action="reset">重置两线</button>
    </div>
    <p class="council-note council-status" data-view="status" role="status"></p>
  </section>
  <section class="council-sheet" aria-label="目标对照">
    <div class="council-heading">
      <h3>目标对照</h3>
      <p>同年对照，括号内为相对共同起点的变化。各项目标范围为 0–100 点。</p>
    </div>
    <div class="council-goals" data-view="goals"></div>
  </section>
  <div class="council-workbench">
    <section class="council-sheet" aria-label="生活圈观察">
      <div class="council-heading"><h3>生活圈观察</h3></div>
      <div class="council-lens-controls">
        <label>观察路线<select name="branch">${routes}</select></label>
        <label>观察圈<select name="role">${circles}</select></label>
      </div>
      <div class="council-lens" data-view="lens"></div>
    </section>
    <section class="council-sheet" aria-label="回合账本">
      <div class="council-heading">
        <h3>回合账本</h3>
        <label>查看回合<select name="record"></select></label>
      </div>
      <div class="council-record" data-view="record"></div>
    </section>
  </div>
  <details class="council-sheet council-details">
    <summary>规则与复演</summary>
    <div>
      <p>先按开年状态检查预算和发起圈门槛，再扣费、处理到期信号、执行行动，最后补充预算。</p>
      <p>新信号强度为 ${signal.strength}。过边会衰减。接收值为本圈态度加到达强度，门槛为本圈门槛加边阻力。越过门槛后，本圈态度上升并继续转送。每波信号在每圈只触发一次。</p>
      <p>发起与接收分别将相关态度提高 ${signal.sponsorGain} 和 ${signal.receiverGain} 点，其余议题态度各降低 ${signal.otherLoss} 点，范围均为 0–100。初始态度和门槛由实验种子扰动。</p>
      <p>模型版本、起点输入和两线行动序列可用于复演。</p>
      <pre data-view="replay" tabindex="0" aria-label="复演数据"></pre>
      <button type="button" data-action="replay">按记录复演</button>
      <p class="council-note" data-view="replay-status" role="status"></p>
    </div>
  </details>`;
}

function setOptions(document, select, options, selected) {
  select.replaceChildren(...options.map(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));
  select.value = selected;
}

function routeMarkup(from, name, to) {
  return `<span class="council-route">${roles[from]} <span>→ ${name} →</span> ${roles[to]}</span>`;
}

function effectText(policy) {
  if (policy === 'survey') return `接下来 ${survey.rounds} 年的门槛减 ${survey.relief} 点，邻圈摘要延 ${survey.reportDelay} 年公布。`;
  if (policy === 'hold') return '等待在途信号并恢复预算。';
  return Object.entries(policies[policy]?.effects ?? {}).map(([id, value]) => `${goals[id]} ${signed(value)}`).join(' · ');
}

function comparisonMarkup(start, states) {
  return Object.entries(goals).map(([id, name]) => {
    const readings = BRANCHES.map(branch => {
      const value = states[branch.id].goals[id];
      return `<div data-branch="${branch.id}" class="council-readout">
        <p>${branch.name} <strong class="council-numeric">${value}</strong> (${signed(value - start.goals[id])})</p>
        <meter min="0" max="100" value="${value}" aria-label="${branch.name}${name}">${value}</meter>
      </div>`;
    });
    return `<div class="council-goal">
      <div><h4>${name}</h4><p class="council-note">起点 ${start.goals[id]}</p></div>
      ${readings.join('')}
    </div>`;
  }).join('');
}

function lensMarkup(view, originYear) {
  const { beliefs, links, relief, role, survey: { pending, report } } = view;
  const proposal = Object.values(policies).find(policy => policy.sponsor === role);
  return `<p class="council-note">本圈发起「${proposal.name}」。以下为本圈态度与当前门槛${relief ? `（调研减免 ${relief} 点）` : ''}。</p>
  <dl class="council-beliefs">${Object.entries(beliefs).map(([id, belief]) => `<div>
    <dt>${policies[id].name}</dt>
    <dd><span class="council-numeric">${belief.support} / ${belief.threshold}</span>
      <span class="council-result" data-result="${belief.accepts ? 'passed' : 'blocked'}">${belief.accepts ? '达标' : '待达标'}</span>
    </dd>
  </div>`).join('')}</dl>
  <h4>直连路径</h4>
  <ul class="council-links">${links.map(({ from, name, to, delay, loss, barrier }) =>
    `<li>${routeMarkup(from, name, to)} <span class="council-note">延 ${delay} 年 · 衰减 ${loss} · 阻力 ${barrier}</span></li>`).join('')}</ul>
  <h4>调研摘录</h4>
  <p class="council-note">${report
    ? `${originYear + report.sampledAt} 年抽样。${roles[report.circle]}对「${policies[report.policy].name}」的态度在 ${report.minimum}–${report.maximum} 点。`
    : pending ? '本次调研已采样。' : '走访调研可取得一项邻圈态度区间。'}</p>
  ${pending ? `<p class="council-note">新摘录将于 ${originYear + pending.availableAt} 年公布。</p>` : ''}`;
}

function signalMarkup(event, originYear) {
  const { from, edge, to, status, direction, policy, wave, hop, arrivesAt } = event;
  const result = { sent: '已发出', passed: '已传递', blocked: '被挡下' }[status];
  const route = edges.find(link => link.id === edge);
  let reason;
  if (status === 'sent') {
    reason = `过边后强度 ${event.strength}，预计 ${originYear + arrivesAt} 年送达。`;
  } else {
    const time = direction === 'receipt' ? `回执确认 ${originYear + arrivesAt} 年送达。` : '';
    if (event.reason === 'already-reached') reason = `${time}本波信号已在目的圈触发。`;
    else if (direction === 'receipt') reason = `${time}接收值${status === 'passed' ? '达到' : '未达'}对方门槛。`;
    else reason = `本圈态度 ${event.support} + 到达强度 ${event.strength} = ${event.score} ${status === 'passed' ? '≥' : '<'} 接收门槛 ${event.threshold}。`;
  }
  return `<li>
    <div class="council-signal-head">${routeMarkup(from, route.name, to)}
      <span class="council-result" data-result="${status}">${result}</span>
    </div>
    <p class="council-note">${policies[policy].name} · 第 ${wave} 轮发起 · 第 ${hop} 跳</p>
    <p>${reason}</p>
  </li>`;
}

function recordMarkup(entry, originYear) {
  if (!entry) return '<p class="council-note">推进首轮后可查看行动、收支、目标变化与本圈信号。</p>';
  const { opening, spent, restored, closing } = entry.budget;
  const outcome = Object.entries(entry.goals).map(([id, { change }]) => `${goals[id]} ${signed(change)}`).join(' · ');
  const changes = entry.localChanges.map(({ wave, cause, before, after }) => {
    const deltas = Object.entries(after).filter(([id, value]) => before[id] !== value)
      .map(([id, value]) => `${policies[id].name} ${before[id]} → ${value}`).join(' · ');
    return deltas ? `<li>第 ${wave} 轮信号${cause === 'policy' ? '发起' : '传入'} · ${deltas}</li>` : '';
  }).filter(Boolean);
  return `<dl class="council-entry">
    <dt>行动</dt><dd>${policies[entry.policy].name}</dd>
    <dt>点数</dt><dd class="council-numeric">${opening} − ${spent} + ${restored} = ${closing}</dd>
    <dt>目标变化</dt><dd>${outcome}</dd>
  </dl>
  <h4>本圈可见的信号</h4>
  ${entry.signals.length ? `<ol class="council-signals">${entry.signals.map(event => signalMarkup(event, originYear)).join('')}</ol>`
    : `<p class="council-note">本轮无可见信号。发件圈可在送达后 ${signal.receiptDelay} 年看到回执。</p>`}
  ${changes.length ? `<h4>本圈态度变化</h4><ul class="council-changes">${changes.join('')}</ul>` : ''}`;
}

export function renderCouncil(host, ctx) {
  const document = host.ownerDocument;
  installStyles(document);
  const root = document.createElement('div');
  root.className = 'oa-council';
  root.lang = 'zh-CN';
  host.replaceChildren(root);

  const countries = new Map(ctx.countries.map(country => [String(country.id), country]));
  const years = [...new Set(ctx.years)].sort((first, second) => second - first);
  if (!countries.size || !years.length) {
    root.textContent = '地图暂未提供可选地区或起点年份。';
    return;
  }
  root.innerHTML = markup();
  const slot = name => root.querySelector(`[data-view="${name}"]`);
  const field = name => root.querySelector(`[name="${name}"]`);
  const action = name => root.querySelector(`[data-action="${name}"]`);
  const regionField = field('region');
  const yearField = field('year');
  const seedField = field('seed');
  const recordField = field('record');
  const countryName = country => country.zh || country.name || String(country.id);
  const regionOptions = [...countries].map(([id, country]) => [id, countryName(country)])
    .sort((first, second) => first[1].localeCompare(second[1], 'zh-Hans'));
  const defaultRegion = countries.has(String(ctx.country?.id)) ? String(ctx.country.id) : String(ctx.countries[0].id);
  setOptions(document, regionField, regionOptions, defaultRegion);
  setOptions(document, yearField, years.map(year => [year, `${year} 年`]), years.includes(ctx.year) ? ctx.year : years[0]);

  let start;
  let states;
  let view;

  function adoptOrigin() {
    const country = countries.get(regionField.value);
    const year = Number(yearField.value);
    const seed = seedField.value.trim();
    if (!seed) {
      seedField.setCustomValidity('请输入实验种子。');
      seedField.reportValidity();
      return;
    }
    const observed = Object.fromEntries(Object.keys(MEASUREMENTS).map(id => {
      const value = ctx.value(country.id, id, year);
      return [id, Number.isFinite(value) ? value : null];
    }));
    start = createCouncil({ region: regionField.value, year, seed, urban: observed.urban, electric: observed.electric });
    slot('origin').textContent = `当前起点 ${countryName(country)} · ${year} 年。人口仅供查阅，比例以整数点进入物质起点。`;
    slot('measurements').innerHTML = Object.entries(MEASUREMENTS).map(([id, name]) => {
      const value = observed[id] === null ? '缺少该年观测' : `${number.format(observed[id])}${id === 'pop' ? ' 人' : '%'}`;
      const data = start.measurements[id];
      const rule = data?.source === 'fictional'
        ? `<small>${data.reason === 'outside-range' ? '超出游戏范围 · ' : ''}游戏假设采用 ${data.used}%</small>` : '';
      const code = ctx.metrics?.find(metric => metric.id === id)?.code;
      return `<div><dt>${name}${code ? `<small>${esc(code)}</small>` : ''}</dt><dd>${value}${rule}</dd></div>`;
    }).join('');
    restart('已采用起点。');
  }

  function renderChoices() {
    let allowed = true;
    for (const { id } of BRANCHES) {
      const state = states[id];
      const policy = field(`policy-${id}`).value;
      const review = checkProposal(state, policy);
      allowed = allowed && review.ok;
      slot(`balance-${id}`).textContent = `可用 ${state.budget} 点`;
      slot(`effect-${id}`).textContent = effectText(policy);
      slot(`check-${id}`).innerHTML = review.rules.map(rule =>
        `<li data-result="${rule.ok ? 'passed' : 'blocked'}">${esc(rule.reason)}</li>`).join('');
    }
    action('advance').disabled = !allowed;
  }

  function showRecord() {
    slot('record').innerHTML = recordMarkup(view.history[Number(recordField.value) - 1], start.year);
  }

  function renderObservation(followLatest = false) {
    view = observeCouncil(states[field('branch').value], field('role').value);
    if (followLatest) {
      const rounds = view.history.map(({ round, year }) => [round, `第 ${round} 轮 · ${year} 年`]).reverse();
      setOptions(document, recordField, rounds.length ? rounds : [[0, '起始年']], view.round);
    }
    slot('lens').innerHTML = lensMarkup(view, start.year);
    showRecord();
  }

  function refresh(status) {
    const { year, round } = states.a;
    slot('clock').textContent = `${year} 年 · ${round ? `第 ${round} 轮` : '起点'}`;
    renderChoices();
    renderObservation(true);
    slot('goals').innerHTML = comparisonMarkup(start, states);
    slot('replay').textContent = JSON.stringify({
      modelVersion: start.modelVersion,
      origin: start.origin,
      actions: Object.fromEntries(BRANCHES.map(({ id }) => [id, states[id].ledger.map(entry => entry.policy)])),
    }, null, 2);
    slot('status').textContent = status;
    slot('replay-status').textContent = '';
  }

  function restart(status) {
    states = { a: start, b: start };
    for (const { id, opening } of BRANCHES) field(`policy-${id}`).value = opening;
    refresh(status);
  }

  root.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    adoptOrigin();
  });
  seedField.addEventListener('input', () => seedField.setCustomValidity(''));
  for (const { id } of BRANCHES) field(`policy-${id}`).addEventListener('change', renderChoices);
  field('branch').addEventListener('change', () => renderObservation());
  field('role').addEventListener('change', () => renderObservation());
  recordField.addEventListener('change', showRecord);
  action('advance').addEventListener('click', () => {
    states = Object.fromEntries(BRANCHES.map(({ id }) => [id, advanceCouncil(states[id], field(`policy-${id}`).value)]));
    refresh(`两线已推进至 ${states.a.year} 年。`);
  });
  action('reset').addEventListener('click', () => restart('两线已回到共同起点。'));
  action('replay').addEventListener('click', () => {
    states = Object.fromEntries(BRANCHES.map(({ id }) => [
      id, states[id].ledger.reduce((state, entry) => advanceCouncil(state, entry.policy), createCouncil(start.origin)),
    ]));
    refresh(`两线已复演至 ${states.a.year} 年。`);
    slot('replay-status').textContent = `已从相同输入重建两线各 ${states.a.round} 轮。`;
  });
  adoptOrigin();
}
