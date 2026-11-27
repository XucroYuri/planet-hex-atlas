const DATA = new URL('../data/markets/', import.meta.url);
const STYLESHEET = new URL('../markets.css', import.meta.url).href;
const WORKER = new URL('./market-worker.js', import.meta.url);
const ODGL = 'https://data.gov.tw/license';
const SOURCES = [
  ['上市个股日成交资讯（11549）', 'Daily trading data (11549)', 'https://data.gov.tw/dataset/11549'],
  ['个股本益比、殖利率及股价净值比（11547）', 'Valuations and dividend yields (11547)', 'https://data.gov.tw/dataset/11547'],
  ['个股估值按日查询（11764）', 'Daily valuation reports (11764)', 'https://data.gov.tw/dataset/11764'],
  ['TWSE 市场每日行情', 'TWSE daily market quotes', 'https://www.twse.com.tw/en/trading/historical/mi-index.html'],
  ['TWSE 个股月内日成交资讯', 'TWSE daily trading data by security and month', 'https://www.twse.com.tw/en/trading/historical/stock-day.html'],
];
const COLUMNS = [
  ['date', '日期', 'Date'],
  ['open', '开盘价', 'Open'],
  ['high', '最高价', 'High'],
  ['low', '最低价', 'Low'],
  ['close', '收盘价', 'Close'],
  ['volume', '成交量（股）', 'Volume (shares)'],
  ['value', '成交额', 'Trade value'],
  ['pe', '市盈率', 'P/E'],
  ['pb', '市净率', 'P/B'],
  ['dividendYield', '股息率', 'Dividend yield'],
];
const LOCAL_COLUMNS = [
  ['previousClose', '前收盘价', 'Previous close'],
  ['floatCap', '流通市值', 'Float market cap'],
  ['totalCap', '总市值', 'Total market cap'],
];
const PERIODS = [
  [1, '近一月', '1 month'],
  [3, '近三月', '3 months'],
  [12, '近一年', '1 year'],
  [0, '全部', 'All'],
];
const FILE_ERRORS = {
  fileType: ['请选择 ZIP 或 CSV 文件。', 'Choose a ZIP or CSV file.'],
  invalidZip: ['ZIP 文件不完整或其中的证券文件已损坏。', 'The ZIP is incomplete or the security file is damaged.'],
  unsupportedZip: ['请选择单卷 ZIP 文件。', 'Choose a single-volume ZIP file.'],
  unsupportedEntry: ['请选择未加密、使用存储或 Deflate 压缩的 ZIP。', 'Choose an unencrypted ZIP using Stored or Deflate compression.'],
  noDecompressor: ['当前浏览器无法解压此 ZIP。可选择解压后的 CSV。', 'This browser cannot decompress this ZIP. Choose an extracted CSV.'],
  directoryTooLarge: ['ZIP 目录过大。可选择解压后的 CSV。', 'The ZIP directory is too large. Choose an extracted CSV.'],
  csvTooLarge: ['单个 CSV 超过 64 MiB。可按证券或日期拆分。', 'The CSV exceeds 64 MiB. Split it by security or date.'],
  noZipSecurities: ['ZIP 中没有可识别的证券 CSV，例如 stock/sh600000.csv。', 'The ZIP has no recognized security CSVs, such as stock/sh600000.csv.'],
  noCsvHeader: ['CSV 缺少证券代码、日期、开高低收、成交量或成交额列。', 'The CSV needs a security code, date, OHLC, volume, and trade value.'],
  noCsvRows: ['CSV 中没有该证券的有效日期记录。', 'The CSV contains no valid dates for this security.'],
  invalidEncoding: ['请选择 UTF-8 或 GB18030 编码的 CSV。', 'Choose a UTF-8 or GB18030 encoded CSV.'],
  invalidCsv: ['CSV 中有未闭合的引号。', 'The CSV contains an unclosed quote.'],
  readFailure: ['无法在本机读取该文件。请重新选择文件。', 'The file could not be read locally. Choose it again.'],
};
const PAGE_SIZE = 25;
const MAX_RESULTS = 60;
const ONE_DAY = 86_400_000;

function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function link(zh, en, href, translate) {
  return el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, translate(zh, en));
}

function ensureStylesheet() {
  if (!document.getElementById('orbis-markets-css')) {
    document.head.append(el('link', { id: 'orbis-markets-css', rel: 'stylesheet', href: STYLESHEET }));
  }
}

function newDataset() {
  return {
    summary: null, symbols: [], selected: null, rows: [], query: '', page: 0, period: 0,
    from: '', to: '', request: 0, busy: '', error: '', retry: null,
  };
}

function timeOf(isoDate) {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

export function marketRange(rows, period, from, to) {
  if (period === null) return { from, to };
  if (!rows.length) return { from: '', to: '' };
  const first = rows[0].date;
  const last = rows.at(-1).date;
  if (!period) return { from: first, to: last };
  const start = new Date(timeOf(last));
  const lastDay = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - period + 1);
  start.setUTCDate(0);
  start.setUTCDate(Math.min(lastDay, start.getUTCDate()));
  const date = start.toISOString().slice(0, 10);
  return { from: date < first ? first : date, to: last };
}

export function rowsInMarketRange(rows, { from, to }) {
  return rows.filter(row => (!from || row.date >= from) && (!to || row.date <= to));
}

function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  const escaped = typeof value === 'string' && /^\s*[-+=@\t\r]/.test(value) ? `'${text}` : text;
  return /[",\r\n]/.test(escaped) ? `"${escaped.replaceAll('"', '""')}"` : escaped;
}

export function marketCsv(symbol, rows, isLocal) {
  const columns = [...COLUMNS, ...(isLocal ? LOCAL_COLUMNS : [])].map(([key]) => key);
  const fields = ['code', 'name', 'currency', ...columns];
  if (!isLocal) fields.push('source', 'license');
  const lines = rows.map(row => {
    const values = [symbol.code, symbol.name, symbol.currency, ...columns.map(key => row[key])];
    if (!isLocal) values.push(`${row.date.slice(0, 4)} Taiwan Stock Exchange / Securities and Futures Bureau, FSC`, ODGL);
    return values.map(csvCell).join(',');
  });
  return `\uFEFF${[fields.join(','), ...lines].join('\r\n')}\r\n`;
}

function downloadCsv(symbol, rows, isLocal) {
  const blob = new Blob([marketCsv(symbol, rows, isLocal)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const download = el('a', { href: url, download: `${symbol.code}-${rows[0].date}-${rows.at(-1).date}.csv`, hidden: '' });
  document.body.append(download);
  download.click();
  download.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function tradedClose(row) {
  return row.close > 0 && row.volume !== 0;
}

function drawChart(canvas, rows, axis, dateLabel) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const pen = canvas.getContext('2d');
  if (!pen || !rows.length) return;
  pen.scale(ratio, ratio);
  const style = getComputedStyle(canvas);
  const grid = style.getPropertyValue('--market-line').trim();
  const priceInk = style.getPropertyValue('--market-teal').trim();
  const volumeInk = style.getPropertyValue('--market-copper').trim();
  pen.font = '11px system-ui, sans-serif';
  pen.textBaseline = 'middle';

  const times = rows.map(row => timeOf(row.date));
  const first = times[0];
  const last = times.at(-1);
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    if (tradedClose(row)) {
      min = Math.min(min, row.close);
      max = Math.max(max, row.close);
    }
  }
  const hasPrices = min !== Infinity;
  if (!hasPrices) { min = 0; max = 1; }
  const margin = Math.max((max - min) * 0.08, max === min ? max * 0.025 : 0, 0.00001);
  const floor = Math.max(0, min - margin);
  const ceiling = max + margin;
  const volumeMax = rows.reduce((highest, row) => Math.max(highest, row.volume ?? 0), 0);
  const tickValues = hasPrices ? [ceiling, (floor + ceiling) / 2, floor] : [];
  const left = 12 + Math.ceil(Math.max(20, ...[...tickValues, volumeMax].map(value => pen.measureText(axis(value)).width)));
  const right = width - 9;
  const top = 13;
  const bottom = height - 27;
  const volumeTop = bottom - 48;
  const priceBottom = volumeTop - 20;
  const xAt = time => first === last ? (left + right) / 2 : left + (right - left) * (time - first) / (last - first);
  const yAt = price => priceBottom - (price - floor) / (ceiling - floor) * (priceBottom - top);
  const rule = (y, value, color) => {
    pen.strokeStyle = grid;
    pen.beginPath();
    pen.moveTo(left, y);
    pen.lineTo(right, y);
    pen.stroke();
    pen.fillStyle = color;
    pen.textAlign = 'right';
    pen.fillText(axis(value), left - 6, y);
  };
  tickValues.forEach(value => rule(yAt(value), value, priceInk));
  if (volumeMax) rule(volumeTop, volumeMax, volumeInk);
  rule(bottom, 0, volumeInk);

  const barWidth = Math.min(9, Math.max(1, (right - left) / rows.length * 0.65));
  pen.fillStyle = volumeInk;
  pen.globalAlpha = 0.68;
  rows.forEach((row, index) => {
    if (!(row.volume > 0)) return;
    const bar = (bottom - volumeTop) * row.volume / volumeMax;
    pen.fillRect(xAt(times[index]) - barWidth / 2, bottom - bar, barWidth, bar);
  });
  pen.globalAlpha = 1;
  pen.strokeStyle = priceInk;
  pen.fillStyle = priceInk;
  pen.lineWidth = 1.6;
  pen.beginPath();
  rows.forEach((row, index) => {
    if (!tradedClose(row)) return;
    const xx = xAt(times[index]);
    const yy = yAt(row.close);
    const connected = index > 0 && tradedClose(rows[index - 1]) && times[index] - times[index - 1] <= 4 * ONE_DAY;
    if (connected) pen.lineTo(xx, yy);
    else pen.moveTo(xx, yy);
    if (rows.length <= 70 || !connected) pen.fillRect(xx - 1.5, yy - 1.5, 3, 3);
  });
  pen.stroke();

  pen.fillStyle = style.getPropertyValue('--market-muted').trim();
  const ticks = first === last ? [first] : (width < 390 ? [first, last] : [first, (first + last) / 2, last]);
  ticks.forEach((time, index) => {
    pen.textAlign = ticks.length === 1 ? 'center' : (index === 0 ? 'left' : (index === ticks.length - 1 ? 'right' : 'center'));
    pen.fillText(dateLabel.format(time), xAt(time), height - 10);
  });
}

export function renderMarkets(host, ctx) {
  const locale = ctx.locale || 'zh-CN';
  const translate = (zh, en) => ctx.t ? ctx.t(zh, en) : (locale.toLowerCase().startsWith('zh') ? zh : en);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 4 });
  const axis = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 });
  const calendar = { timeZone: 'UTC' };
  const dates = new Intl.DateTimeFormat(locale, { ...calendar, dateStyle: 'medium' });
  const dateTick = new Intl.DateTimeFormat(locale, { ...calendar, year: '2-digit', month: 'short', day: 'numeric' });
  const formatDate = day => dates.format(timeOf(day));
  const interval = (first, last) => `${formatDate(first)} – ${formatDate(last)}`;
  const taiwan = newDataset();
  const local = newDataset();
  const abort = new AbortController();
  let dataset = taiwan;
  let worker;
  let fileName = '';
  let hits = [];
  let shownRows = [];
  let watching;
  let readQuotes = null;

  ensureStylesheet();
  const twButton = el('button', { type: 'button' }, translate('台湾证交所', 'Taiwan Stock Exchange'));
  const localButton = el('button', { type: 'button' }, translate('本地 A 股', 'Local A-shares'));
  const sources = el('div', { class: 'market-sources', role: 'group', 'aria-label': translate('行情来源', 'Market data source') }, twButton, localButton);
  const file = el('input', { type: 'file', accept: '.zip,.csv,application/zip,text/csv', hidden: '' });
  const pick = el('button', { type: 'button' }, translate('选择 ZIP 或 CSV', 'Choose a ZIP or CSV'));
  const picked = el('span', { class: 'market-file-name' });
  const importArea = el('section', { class: 'market-import', hidden: '' },
    el('div', { class: 'market-file' }, pick, file, picked),
    el('p', {}, translate('支持 UTF-8 和 GB18030。文件只在此浏览器内读取。', 'Supports UTF-8 and GB18030. Files are processed in this browser.')));
  const overview = el('p', { class: 'market-overview' });

  const search = el('input', { type: 'search', autocomplete: 'off', spellcheck: 'false' });
  const selector = el('select');
  const matches = el('span', { class: 'market-matches', 'aria-live': 'polite' });
  const lookup = el('div', { class: 'market-lookup' },
    el('label', {}, translate('查找代码或名称', 'Find by code or name'), search),
    el('label', {}, translate('证券', 'Security'), selector), matches);
  const status = el('p', { role: 'status', class: 'market-message' });
  const retry = el('button', { type: 'button', hidden: '' }, translate('重试', 'Retry'));

  const name = el('h3');
  const coverage = el('p', { class: 'market-coverage' });
  const recent = el('p', { class: 'market-close' });
  const exportButton = el('button', { type: 'button' }, translate('导出 CSV', 'Export CSV'));
  const periods = PERIODS.map(([key, zh, en]) => [key, el('button', { type: 'button' }, translate(zh, en))]);
  const from = el('input', { type: 'date' });
  const to = el('input', { type: 'date' });
  const dateControls = el('div', { class: 'market-dates' },
    el('label', {}, translate('起始日期', 'From'), from), el('label', {}, translate('结束日期', 'To'), to));
  const priceLegend = el('span', { class: 'market-legend-price' });
  const chart = el('canvas', { role: 'img', 'aria-label': translate('按实际交易日期绘制的收盘价和成交量', 'Closing prices and volume by recorded trading date') });
  const chartArea = el('figure', { class: 'market-figure' },
    el('figcaption', {}, priceLegend, el('span', { class: 'market-legend-volume' }, translate('成交量（股）', 'Volume (shares)'))), chart);
  const rangeStatus = el('p', { class: 'market-message', role: 'status' });
  const header = el('tr');
  const tableBody = el('tbody');
  const tableArea = el('div', { class: 'market-scroll', tabindex: '0', role: 'region', 'aria-label': translate('每日行情表', 'Daily market data table') },
    el('table', {}, el('thead', {}, header), tableBody));
  const previous = el('button', { type: 'button' }, translate('上一页', 'Previous'));
  const next = el('button', { type: 'button' }, translate('下一页', 'Next'));
  const pageLabel = el('span', { 'aria-live': 'polite' });
  const pages = el('div', { class: 'market-pages' }, previous, pageLabel, next);
  const history = el('section', { class: 'market-history', hidden: '' },
    el('header', { class: 'market-security' }, el('div', {}, name, coverage), recent),
    el('div', { class: 'market-tools' },
      el('div', { class: 'market-periods', role: 'group', 'aria-label': translate('图表和表格时间范围', 'Chart and table date range') }, ...periods.map(([, button]) => button)),
      dateControls, exportButton),
    chartArea, rangeStatus, tableArea, pages);

  const creditYears = el('span');
  const credits = el('details', { class: 'market-credits' },
    el('summary', {}, translate('数据来源与授权', 'Sources and license')),
    el('p', {},
      translate('台湾证券交易所及台湾金融监督管理委员会证券期货局', 'Taiwan Stock Exchange and the Securities and Futures Bureau, FSC'),
      creditYears,
      translate('。数值按证券及日期匹配，依台湾政府资料开放授权条款第 1 版提供。', '. Values are matched by security and date and released under the Taiwan Government Open Data License, version 1.0.')),
    el('ul', {}, ...[...SOURCES, ['台湾政府资料开放授权条款（ODGL 1.0）', 'Taiwan Government Open Data License (ODGL 1.0)', ODGL]]
      .map(([zh, en, href]) => el('li', {}, link(zh, en, href, translate)))));
  const root = el('article', { class: 'oa-markets', lang: locale },
    sources, importArea, overview, lookup, el('div', { class: 'market-feedback' }, status, retry), history, credits);
  host.replaceChildren(root);

  function updateMenu() {
    const query = dataset.query.normalize('NFKC').trim().toLowerCase();
    hits = dataset.symbols.filter(symbol => symbol.code.toLowerCase().includes(query)
      || symbol.name.normalize('NFKC').toLowerCase().includes(query));
    const visible = hits.slice(0, MAX_RESULTS);
    if (!query && dataset.selected && !visible.includes(dataset.selected)) visible.unshift(dataset.selected);
    selector.replaceChildren(
      el('option', { value: '' }, translate('选择证券', 'Choose a security')),
      ...visible.map(symbol => el('option', { value: symbol.code }, symbol.name ? `${symbol.code} · ${symbol.name}` : symbol.code)),
    );
    selector.value = visible.includes(dataset.selected) ? dataset.selected.code : '';
    selector.disabled = !visible.length;
    search.disabled = !dataset.symbols.length;
    matches.textContent = query || hits.length > MAX_RESULTS
      ? translate(`${number.format(hits.length)} 个匹配${hits.length > MAX_RESULTS ? '，可缩小搜索范围' : ''}`,
        `${number.format(hits.length)} matches${hits.length > MAX_RESULTS ? '. Refine your search to see more' : ''}`)
      : '';
  }

  function updateOverview() {
    const summary = dataset.summary;
    if (!summary) { overview.textContent = ''; return; }
    const count = number.format(summary.symbols.length);
    if (summary.kind === 'zip') {
      overview.textContent = translate(`ZIP 内有 ${count} 只证券。打开证券后可查看它的名称与日期覆盖。`,
        `The ZIP contains ${count} securities. Open a security to see its name and date coverage.`);
    } else if (summary.kind === 'csv') {
      overview.textContent = translate(`CSV 覆盖 ${interval(summary.first, summary.last)}，共 ${count} 只证券。`,
        `CSV coverage is ${interval(summary.first, summary.last)} across ${count} securities.`);
    } else {
      const sessions = number.format(summary.sessions);
      overview.textContent = translate(`公开缓存涵盖 ${interval(summary.first, summary.last)} 之间的 ${sessions} 个有记录日期，共 ${count} 只证券。`,
        `The public archive has records on ${sessions} dates between ${interval(summary.first, summary.last)}, across ${count} securities.`);
    }
  }

  function updateTable() {
    const columns = dataset === local ? [...COLUMNS, ...LOCAL_COLUMNS] : COLUMNS;
    const first = dataset.page * PAGE_SIZE;
    const end = Math.min(first + PAGE_SIZE, shownRows.length);
    header.replaceChildren(...columns.map(([, zh, en]) => el('th', { scope: 'col' }, translate(zh, en))));
    tableBody.replaceChildren(...shownRows.slice(shownRows.length - end, shownRows.length - first).reverse().map(row =>
      el('tr', {}, ...columns.map(([key]) => {
        const value = row[key];
        if (key === 'date') {
          return el('th', { scope: 'row' }, el('time', { datetime: value }, formatDate(value)),
            ...(row.volume === 0 ? [el('small', { class: 'market-no-trade' }, translate('无成交', 'No trades'))] : []));
        }
        const label = value == null ? '—' : (key === 'dividendYield' ? percent.format(value / 100) : number.format(value));
        return el('td', {}, label);
      }))));
    previous.disabled = !first;
    next.disabled = end >= shownRows.length;
    const total = number.format(shownRows.length);
    const entries = `${number.format(first + 1)}–${number.format(end)}`;
    pageLabel.textContent = translate(`${entries} 行，共 ${total} 行`, `${entries} of ${total} rows`);
  }

  function redraw() {
    if (!chartArea.hidden && !history.hidden) drawChart(chart, shownRows, axis.format, dateTick);
  }

  function updateHistory() {
    const { selected, rows, period } = dataset;
    history.hidden = !selected || !rows.length;
    if (history.hidden) { shownRows = []; return; }
    name.textContent = selected.name ? `${selected.name} · ${selected.code}` : selected.code;
    const currency = selected.currency || translate('币种未知', 'Currency unknown');
    const span = interval(rows[0].date, rows.at(-1).date);
    const count = number.format(rows.length);
    coverage.textContent = translate(`${currency} · ${span} · ${count} 条日记录`, `${currency} · ${span} · ${count} daily records`);
    priceLegend.textContent = translate(`收盘价（${currency}）`, `Close (${currency})`);

    const range = marketRange(rows, period, dataset.from, dataset.to);
    from.value = range.from;
    to.value = range.to;
    for (const [key, button] of periods) button.setAttribute('aria-pressed', String(key === period));
    const invalid = Boolean(range.from && range.to && range.from > range.to);
    shownRows = invalid ? [] : rowsInMarketRange(rows, range);
    const empty = !shownRows.length;
    rangeStatus.textContent = invalid ? translate('起始日期须早于或等于结束日期。', 'The start date must be on or before the end date.')
      : empty ? translate('此时间范围内没有记录。', 'No records in this date range.') : '';
    rangeStatus.hidden = !empty;
    const lastTrade = shownRows.findLast(tradedClose);
    recent.replaceChildren();
    if (lastTrade) recent.append(
      el('span', {}, translate('区间最后收盘', 'Last close in range')),
      el('strong', {}, number.format(lastTrade.close)),
      el('time', { datetime: lastTrade.date }, formatDate(lastTrade.date)),
    );
    exportButton.disabled = empty;
    chartArea.hidden = empty;
    tableArea.hidden = empty;
    pages.hidden = empty || shownRows.length <= PAGE_SIZE;
    if (!empty) {
      updateTable();
      redraw();
    }
  }

  function update() {
    const isLocal = dataset === local;
    twButton.setAttribute('aria-pressed', String(!isLocal));
    localButton.setAttribute('aria-pressed', String(isLocal));
    importArea.hidden = !isLocal;
    credits.hidden = isLocal;
    picked.textContent = fileName;
    search.value = dataset.query;
    updateOverview();
    updateMenu();
    status.textContent = dataset.error || ({
      index: translate('正在读取公开数据目录…', 'Loading the public data index…'),
      file: translate('正在本机读取文件…', 'Reading the file locally…'),
      security: translate('正在读取证券历史…', 'Loading security history…'),
    })[dataset.busy] || (isLocal && dataset.summary && !dataset.selected ? translate('请选择要查看的证券。', 'Choose a security to view its history.') : '');
    status.hidden = !status.textContent;
    retry.hidden = !dataset.retry;
    updateHistory();
  }

  function refresh(source) {
    if (!abort.signal.aborted && source === dataset) update();
  }

  async function getJson(path) {
    const response = await fetch(new URL(path, DATA), { signal: abort.signal });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  function fail(source, error, retryAction = null) {
    source.error = error;
    source.busy = '';
    source.retry = retryAction;
    refresh(source);
  }

  async function selectSecurity(source, symbol) {
    if (!symbol || (source.selected === symbol && source.rows.length)) return;
    const id = ++source.request;
    source.selected = symbol;
    source.rows = [];
    source.page = 0;
    source.error = '';
    source.retry = null;
    source.busy = 'security';
    refresh(source);
    if (source === local) {
      worker.postMessage({ type: 'rows', id, code: symbol.code });
      return;
    }
    try {
      if (readQuotes?.shard !== symbol.shard) readQuotes = { shard: symbol.shard, promise: getJson(symbol.shard) };
      const read = readQuotes;
      const quotes = await read.promise.catch(error => {
        if (readQuotes === read) readQuotes = null;
        throw error;
      });
      if (source.request !== id || abort.signal.aborted) return;
      const fields = source.summary.fields;
      source.rows = quotes[symbol.code].map(row => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
      source.busy = '';
      refresh(source);
    } catch {
      if (source.request === id) fail(source, translate('无法加载该证券的历史行情。', 'The security history could not be loaded.'), () => selectSecurity(source, symbol));
    }
  }

  async function loadTaiwan() {
    taiwan.busy = 'index';
    taiwan.error = '';
    taiwan.retry = null;
    refresh(taiwan);
    try {
      const summary = await getJson('index.json');
      if (summary.version !== 1 || !summary.symbols?.length || !summary.fields?.length) throw new Error('Invalid market data');
      taiwan.summary = summary;
      taiwan.symbols = summary.symbols;
      const year = new Intl.DateTimeFormat(locale, { ...calendar, year: 'numeric' });
      const first = year.format(timeOf(summary.first));
      const last = year.format(timeOf(summary.last));
      creditYears.textContent = ` · ${first === last ? first : `${first}–${last}`}`;
      await selectSecurity(taiwan, taiwan.symbols.find(symbol => symbol.code === '2330') || taiwan.symbols[0]);
    } catch {
      fail(taiwan, translate('无法加载公开行情目录。', 'The public market data index could not be loaded.'), loadTaiwan);
    }
  }

  function openLocal(selectedFile) {
    worker?.terminate();
    const id = local.request + 1;
    Object.assign(local, newDataset(), { request: id, busy: 'file' });
    fileName = selectedFile.name;
    refresh(local);
    try {
      const current = new Worker(WORKER, { type: 'module' });
      worker = current;
      const failure = code => fail(local, translate(...(FILE_ERRORS[code] || FILE_ERRORS.readFailure)));
      current.addEventListener('error', () => {
        if (worker === current) {
          local.summary = null;
          local.symbols = [];
          failure('readFailure');
        }
      });
      current.addEventListener('message', ({ data: result }) => {
        if (worker !== current || local.request !== result.id || abort.signal.aborted) return;
        if (result.error) { failure(result.error); return; }
        const data = result.data;
        local.busy = '';
        if (data.kind) {
          local.summary = data;
          local.symbols = data.symbols;
          if (data.symbols.length === 1) { selectSecurity(local, data.symbols[0]); return; }
        } else {
          Object.assign(local.selected, data.symbol);
          local.rows = data.rows;
        }
        refresh(local);
      });
      worker.postMessage({ type: 'open', id, file: selectedFile });
    } catch {
      fail(local, translate(...FILE_ERRORS.readFailure));
    }
  }

  twButton.addEventListener('click', () => { dataset = taiwan; update(); });
  localButton.addEventListener('click', () => { dataset = local; update(); });
  pick.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    if (file.files[0]) openLocal(file.files[0]);
    file.value = '';
  });
  retry.addEventListener('click', () => dataset.retry?.());
  search.addEventListener('input', () => { dataset.query = search.value; updateMenu(); });
  search.addEventListener('keydown', event => {
    if (event.key === 'Enter' && hits.length) {
      event.preventDefault();
      const query = dataset.query.normalize('NFKC').trim().toLowerCase();
      selectSecurity(dataset, hits.find(symbol => symbol.code.toLowerCase() === query) || hits[0]);
    }
  });
  selector.addEventListener('change', () => selectSecurity(dataset, dataset.symbols.find(symbol => symbol.code === selector.value)));
  for (const [key, button] of periods) button.addEventListener('click', () => {
    dataset.period = key;
    dataset.page = 0;
    updateHistory();
  });
  for (const input of [from, to]) input.addEventListener('change', () => {
    dataset.period = null;
    dataset.from = from.value;
    dataset.to = to.value;
    dataset.page = 0;
    updateHistory();
  });
  previous.addEventListener('click', () => { dataset.page -= 1; updateTable(); });
  next.addEventListener('click', () => { dataset.page += 1; updateTable(); });
  exportButton.addEventListener('click', () => downloadCsv(dataset.selected, shownRows, dataset === local));

  const resize = new ResizeObserver(redraw);
  resize.observe(chart);
  const dialog = host.closest('dialog');
  function dispose() {
    abort.abort();
    resize.disconnect();
    watching?.disconnect();
    worker?.terminate();
    dialog?.removeEventListener('close', dispose);
  }
  dialog?.addEventListener('close', dispose, { once: true });
  if (root.isConnected) {
    watching = new MutationObserver(() => { if (!root.isConnected) dispose(); });
    watching.observe(document, { subtree: true, childList: true });
  }
  loadTaiwan();
  return dispose;
}
