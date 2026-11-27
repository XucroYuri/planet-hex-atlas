import { formatCount, formatYear, getLocale, msg, numberFormat, registerMessages, yearLabel } from "./i18n.js";
import { continentName, countryName } from "./i18n-places.js";
import explorer from "../i18n/explorer.js";

registerMessages(explorer);

const svgNamespace = "http://www.w3.org/2000/svg";
const countryNames = new Intl.Collator(getLocale(), { numeric: true });
const valueFormat = numberFormat({ maximumSignificantDigits: 6 });
const tinyValueFormat = numberFormat({ notation: "scientific", maximumSignificantDigits: 17 });
const tinyTickFormat = numberFormat({ notation: "scientific", maximumFractionDigits: 1 });
const tickFormat = numberFormat({
  notation: "compact",
  maximumSignificantDigits: 4,
});
const metricName = (metric) => {
  if (!metric) return msg("无可用指标");
  if (!metric.unit) return msg(metric.name);
  return msg("{name}（{unit}）", { name: msg(metric.name), unit: msg(metric.unit) });
};
const valueText = (value) => {
  if (value === null) return msg("缺失");
  return (value !== 0 && Math.abs(value) < 0.001 ? tinyValueFormat : valueFormat).format(value);
};
const percent = (position) => `${position}%`;
const plotPosition = (fraction) => 4 + 92 * fraction;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function graphic(tag, attributes) {
  const node = document.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function button(text, className) {
  const node = element("button", className, text);
  node.type = "button";
  return node;
}

function field(text, options) {
  const label = element("label", "oe-field");
  const select = element("select");
  select.setAttribute("aria-label", text);
  for (const [value, name] of options) select.add(new Option(name, value));
  label.append(element("span", "", text), select);
  return { label, select };
}

function numericScale(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = min === max ? Math.abs(min) / 10 || 1 : 0;
  const lower = min - padding;
  const upper = max + padding;
  const interval = (upper - lower) / 4;
  const power = 10 ** Math.floor(Math.log10(interval));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= interval) * power;
  const first = Math.floor(lower / step);
  const last = Math.ceil(upper / step);
  const start = first * step;
  const end = last * step;
  if (!Number.isFinite(end - start) || last <= first || last - first > 6) {
    const magnitude = Math.max(Math.abs(min), Math.abs(max)) || 1;
    const position = (value) => min === max ? 50 : plotPosition(
      (value / magnitude - min / magnitude) / (max / magnitude - min / magnitude),
    );
    const ticks = (min === max ? [min] : [min, max]).map((value) => ({ at: position(value), label: valueText(value) }));
    return { position, ticks };
  }
  const position = (value) => plotPosition((value - start) / (end - start));
  const tickValues = Array.from({ length: last - first + 1 }, (_, index) => (first + index) * step);
  const labels = tickValues.map((value) => (Math.abs(value) < 0.001 && value !== 0 ? tinyTickFormat : tickFormat).format(value));
  const distinct = new Set(labels).size === labels.length;
  return {
    position,
    ticks: tickValues.map((value, index) => ({ at: position(value), label: distinct ? labels[index] : valueText(value) })),
  };
}

function chart() {
  const box = element("div", "oe-chart");
  const plot = element("div", "oe-plot");
  plot.dir = "ltr";
  const drawing = graphic("svg", { class: "oe-plot-svg", focusable: "false" });
  const labels = element("div", "oe-ticks");
  const empty = element("p", "oe-empty oe-chart-empty");
  plot.setAttribute("aria-hidden", "true");
  plot.append(drawing, labels);
  box.append(plot, empty);
  return { box, plot, drawing, labels, empty };
}

function drawGrid(target, xTicks, yTicks, emptyText = "") {
  target.plot.hidden = Boolean(emptyText);
  target.empty.hidden = !emptyText;
  target.empty.textContent = emptyText;
  target.drawing.replaceChildren();
  target.labels.replaceChildren();
  if (emptyText) return;
  const grid = graphic("g", { class: "oe-grid" });
  for (const { at, label } of xTicks) {
    const tick = element("span", "oe-tick-x", label);
    tick.style.left = percent(at);
    target.labels.append(tick);
    grid.append(graphic("line", { x1: percent(at), x2: percent(at), y1: 0, y2: "100%" }));
  }
  for (const { at, label } of yTicks) {
    const tick = element("span", "oe-tick-y", label);
    tick.style.top = percent(100 - at);
    target.labels.append(tick);
    grid.append(graphic("line", { x1: 0, x2: "100%", y1: percent(100 - at), y2: percent(100 - at) }));
  }
  target.drawing.append(grid);
}

function tableRegion(label, captionText) {
  const wrapper = element("div", "oe-table-scroll");
  const table = element("table", "oe-table");
  const heading = element("tr");
  const head = element("thead");
  const body = element("tbody");
  wrapper.tabIndex = 0;
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", label);
  head.append(heading);
  table.append(element("caption", "oe-sr", captionText), head, body);
  wrapper.append(table);
  return { wrapper, heading, body, caption: table.caption };
}

function valueCell(value) {
  return element("td", value === null ? "oe-number oe-missing" : "oe-number", valueText(value));
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const text = String(value);
  const safe = /^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function downloadCsv(filename, headers, rows) {
  const parts = ["\ufeff", `${headers.map(csvCell).join(",")}\r\n`];
  for (const row of rows) parts.push(`${row.map(csvCell).join(",")}\r\n`);
  const url = URL.createObjectURL(new Blob(parts, { type: "text/csv;charset=utf-8" }));
  const link = element("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function closeHostDialog(host) {
  const dialog = host.closest('dialog, [role="dialog"], [aria-modal="true"], .modal');
  if (!dialog?.isConnected || dialog.hidden || dialog.getAttribute("aria-hidden") === "true" || !dialog.getClientRects().length) return;
  const closeControl = [...dialog.querySelectorAll('button, [role="button"]')].find((control) => {
    if (host.contains(control)) return false;
    const label = (control.getAttribute("aria-label") || control.title || control.textContent).trim();
    return label === msg("关闭弹窗") || /^(关闭(?:弹窗|对话框)?|close(?: dialog)?|[×✕])$/i.test(label)
      || control.matches("[data-close], [data-dialog-close], .modal-close, .dialog-close");
  });
  if (closeControl) closeControl.click();
  else if (dialog.open && typeof dialog.close === "function") dialog.close();
}

function ensureStylesheet() {
  const href = new URL("../explorer.css", import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === href)) return;
  const link = element("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

export function renderExplorer(host, ctx) {
  const countries = [...ctx.countries].sort((left, right) => countryNames.compare(countryName(left), countryName(right)));
  const countriesById = new Map(countries.map((country) => [String(country.id), country]));
  const metrics = ctx.metrics;
  const years = [...ctx.years].sort((left, right) => left - right);
  const continents = [...new Set(countries.map((country) => country.continent ?? ""))]
    .sort((left, right) => countryNames.compare(continentName(left), continentName(right)));
  const metricOptions = metrics.length ? metrics.map((metric) => [metric.id, metricName(metric)]) : [["", msg("无可用指标")]];
  const countryOptions = countries.map((country) => [country.id, countryName(country)]);
  const xField = field(msg("横轴指标"), metricOptions);
  const yField = field(msg("纵轴指标"), metricOptions);
  const yearField = field(msg("年份"), years.length ? years.map((year) => [year, yearLabel(year)]) : [["", msg("无可用年份")]]);
  const continentField = field(msg("地区筛选"), [["", msg("全部地区")], ...continents.map((name, index) => [index, continentName(name)])]);
  const historyField = field(msg("历史指标"), [["x", msg("横轴")], ["y", msg("纵轴")]]);
  const primaryField = field(msg("地区一"), [["", msg("选择地区")], ...countryOptions]);
  const compareField = field(msg("地区二"), [["", msg("不比较")], ...countryOptions]);

  yField.select.selectedIndex = metrics.length > 1 ? 1 : 0;
  xField.select.disabled = yField.select.disabled = !metrics.length;
  yearField.select.disabled = !years.length;
  if (years.length) yearField.select.value = String(years.includes(ctx.year) ? ctx.year : years.at(-1));
  primaryField.select.value = ctx.country && countriesById.has(String(ctx.country.id)) ? String(ctx.country.id) : "";
  primaryField.select.disabled = !countries.length;
  historyField.select.value = "y";
  historyField.select.disabled = !metrics.length;

  ensureStylesheet();
  const root = element("div", "orbis-explorer");
  root.lang = getLocale();
  const controls = element("div", "oe-controls");
  controls.append(xField.label, yField.label, yearField.label, continentField.label);
  const toolbar = element("div", "oe-toolbar");
  const selection = element("span", "oe-selection");
  selection.setAttribute("role", "status");
  const locate = button(msg("在地图定位"), "oe-button-primary");
  const lensX = button(msg("横轴上图"));
  const lensY = button(msg("纵轴上图"));
  const locationActions = element("div", "oe-actions");
  locationActions.append(locate, selection);
  const lensActions = element("div", "oe-actions");
  lensActions.append(lensX, lensY);
  toolbar.append(locationActions, lensActions);

  const overview = element("div", "oe-overview");
  const scatterSection = element("section", "oe-panel oe-scatter");
  const totals = element("p", "oe-totals");
  totals.setAttribute("role", "status");
  const missing = element("p", "oe-note oe-missing-counts");
  const xCaption = element("p", "oe-axis oe-axis-x");
  const yCaption = element("p", "oe-axis oe-axis-y");
  const scatter = chart();
  const pointReadout = element("p", "oe-readout");
  scatterSection.append(element("h3", "", msg("同年散点")), totals, missing, yCaption, scatter.box, xCaption, pointReadout);

  const tableSection = element("section", "oe-panel oe-data");
  const tableHeader = element("div", "oe-panel-heading");
  const exportActions = element("div", "oe-actions");
  const exportYear = button(msg("本年 CSV"));
  const exportAll = button(msg("全量 CSV"));
  exportYear.title = msg("下载当前年份和筛选范围内的两轴数据");
  exportAll.title = msg("下载所有地区、指标和年份");
  exportActions.append(exportYear, exportAll);
  tableHeader.append(element("h3", "", msg("数据表")), exportActions);
  const currentTable = tableRegion(msg("同年散点数据表"), msg("筛选范围内的同年数据，包含缺失值"));
  const sortHeaders = new Map();
  for (const [key, text] of [["country", "地区"], ["x", "横轴"], ["y", "纵轴"]]) {
    const heading = element("th");
    const control = button("", "oe-sort");
    const label = element("span", "", msg(text));
    const arrow = element("span", "oe-sort-arrow");
    arrow.setAttribute("aria-hidden", "true");
    heading.scope = "col";
    control.append(label, arrow);
    heading.append(control);
    currentTable.heading.append(heading);
    sortHeaders.set(key, { heading, control, label, arrow });
  }
  tableSection.append(tableHeader, currentTable.wrapper);
  overview.append(scatterSection, tableSection);

  const historySection = element("section", "oe-panel oe-history");
  const historyControls = element("div", "oe-history-controls");
  historyControls.append(historyField.label, primaryField.label, compareField.label);
  const historyLegend = element("div", "oe-history-legend");
  const historyAxis = element("p", "oe-axis oe-axis-y");
  const history = chart();
  const historyReadout = element("p", "oe-readout");
  historyReadout.setAttribute("role", "status");
  const historyDetails = element("details", "oe-details");
  const historyTable = tableRegion(msg("历史折线逐年数据"), msg("各地区在每个年份的原始数值"));
  historyDetails.append(element("summary", "", msg("查看逐年数据")), historyTable.wrapper);
  historySection.append(
    element("h3", "", msg("历史折线")), historyControls, historyLegend, historyAxis, history.box, historyReadout, historyDetails,
  );

  const sources = element("details", "oe-panel oe-details oe-sources");
  const sourceList = element("ul", "oe-source-list");
  sources.append(
    element("summary", "", msg("世界银行指标来源")),
    sourceList,
    element("p", "oe-note", msg("全量 CSV 包含所有地区、指标和年份。CSV 中的缺失值留空。")),
  );
  root.append(controls, toolbar, overview, historySection, sources);
  host.append(root);

  const csvHeaders = ["年份", "地区代码", "地区中文名", "地区英文名", "洲别"].map((key) => msg(key));
  const countryCells = (country, year) => [year, country.id, country.zh, country.name, country.continent];
  const metricColumn = (metric) => `${metricName(metric)} [${metric.code || metric.id}]`;
  const read = (country, metric, year) => {
    const value = metric && year !== undefined ? ctx.value(country.id, metric.id, year) : null;
    return Number.isFinite(value) ? value : null;
  };
  const countryFrom = (select) => countriesById.get(select.value);
  let snapshot;
  let sortKey = "y";
  let ascending = false;
  let tableButtons = new Map();
  let points = [];
  let hoverPoint;

  function renderCurrentTable() {
    for (const [key, { heading, arrow }] of sortHeaders) {
      if (key === sortKey) heading.setAttribute("aria-sort", ascending ? "ascending" : "descending");
      else heading.removeAttribute("aria-sort");
      arrow.textContent = key === sortKey ? (ascending ? "↑" : "↓") : "↕";
    }
    const sorted = [...snapshot.rows].sort((left, right) => {
      const byName = countryNames.compare(countryName(left.country), countryName(right.country));
      if (sortKey === "country") return ascending ? byName : -byName;
      const leftValue = left[sortKey];
      const rightValue = right[sortKey];
      if (leftValue === rightValue) return byName;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      return ascending ? leftValue - rightValue : rightValue - leftValue;
    });
    tableButtons = new Map();
    currentTable.body.replaceChildren(...sorted.map((row) => {
      const tr = element("tr");
      const heading = element("th");
      const control = button(countryName(row.country), "oe-country");
      heading.scope = "row";
      control.setAttribute("aria-pressed", String(primaryField.select.value === String(row.country.id)));
      control.addEventListener("click", () => selectCountry(row.country));
      tableButtons.set(row.country.id, control);
      heading.append(control);
      tr.append(heading, valueCell(row.x), valueCell(row.y));
      return tr;
    }));
    if (!sorted.length) {
      const tr = element("tr");
      const cell = element("td", "oe-empty", msg("当前范围暂无地区数据。"));
      cell.colSpan = 3;
      tr.append(cell);
      currentTable.body.append(tr);
    }
  }

  function updatePointReadout() {
    const selected = countryFrom(primaryField.select);
    const row = hoverPoint?.row ?? snapshot.rowsById.get(selected?.id);
    if (row) {
      pointReadout.textContent = msg("{country} · 横轴 {x} · 纵轴 {y}", {
        country: countryName(row.country), x: valueText(row.x), y: valueText(row.y),
      });
    } else {
      pointReadout.textContent = msg(selected ? "已选地区在当前筛选范围外。" : "点按散点或在数据表中选择地区。");
    }
  }

  function renderScatter() {
    const { paired, rows, year, xMetric, yMetric } = snapshot;
    const missingX = rows.filter((row) => row.x === null).length;
    const missingY = rows.filter((row) => row.y === null).length;
    const yearPrefix = year === undefined ? "" : `${yearLabel(year)} · `;
    totals.textContent = yearPrefix + msg("可比 {paired} / {total} · 缺任一轴 {missing}", {
      paired: formatCount(paired.length), total: formatCount(rows.length), missing: formatCount(rows.length - paired.length),
    });
    missing.textContent = msg("横轴缺失 {x} · 纵轴缺失 {y} · 双轴缺失 {both}", {
      x: formatCount(missingX), y: formatCount(missingY), both: formatCount(missingX + missingY - rows.length + paired.length),
    });
    xCaption.textContent = `${msg("横轴")} · ${metricName(xMetric)}`;
    yCaption.textContent = `${msg("纵轴")} · ${metricName(yMetric)}`;
    hoverPoint = undefined;
    points = [];
    scatter.plot.classList.remove("oe-hit");
    if (!paired.length) {
      drawGrid(scatter, [], [], msg("当前筛选下没有同年双轴样本。"));
      return;
    }
    const xScale = numericScale(paired.map((row) => row.x));
    const yScale = numericScale(paired.map((row) => row.y));
    drawGrid(scatter, xScale.ticks, yScale.ticks);
    points = paired.map((row) => {
      const left = xScale.position(row.x);
      const top = 100 - yScale.position(row.y);
      const dot = graphic("circle", { cx: percent(left), cy: percent(top), r: 3.4, class: "oe-dot" });
      scatter.drawing.append(dot);
      return { row, left, top, dot };
    });
  }

  function nearestPoint(event) {
    const bounds = scatter.drawing.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    let distance = event.pointerType === "touch" ? 22 ** 2 : 12 ** 2;
    let nearest;
    for (const point of points) {
      const deltaX = localX - point.left * bounds.width / 100;
      const deltaY = localY - point.top * bounds.height / 100;
      const squared = deltaX ** 2 + deltaY ** 2;
      if (squared < distance) {
        nearest = point;
        distance = squared;
      }
    }
    return nearest;
  }

  function previewPoint(point) {
    if (point === hoverPoint) return;
    hoverPoint?.dot.classList.remove("oe-hovered");
    hoverPoint = point;
    hoverPoint?.dot.classList.add("oe-hovered");
    scatter.plot.classList.toggle("oe-hit", Boolean(point));
    updatePointReadout();
  }

  function renderHistory() {
    const metric = historyField.select.value === "x" ? snapshot.xMetric : snapshot.yMetric;
    const primary = countryFrom(primaryField.select);
    const comparison = countryFrom(compareField.select);
    const series = [primary, comparison].filter(Boolean).map((country) => ({
      country,
      values: years.map((year) => read(country, metric, year)),
    }));
    const hasSeries = series.length > 0 && metric && years.length > 0;
    const values = series.flatMap((entry) => entry.values.filter((value) => value !== null));
    historyAxis.hidden = !hasSeries;
    historyAxis.textContent = metricName(metric);
    historyDetails.hidden = !hasSeries;
    historyReadout.hidden = !hasSeries;
    historyLegend.replaceChildren(...series.map(({ country, values: observations }, index) => {
      const valid = observations.filter((value) => value !== null).length;
      return element("span", `oe-series-key oe-series-key-${index}`, msg("{country} · 有值 {valid} / {total} 年", {
        country: countryName(country), valid: formatCount(valid), total: formatCount(years.length),
      }));
    }));
    if (values.length) historyLegend.append(element("span", "oe-note", msg("断点表示缺失")));

    if (hasSeries) {
      const yearIndex = yearField.select.selectedIndex;
      historyReadout.textContent = [
        yearLabel(snapshot.year),
        ...series.map((entry) => `${countryName(entry.country)} ${valueText(entry.values[yearIndex])}`),
      ].join(" · ");
      historyTable.caption.textContent = `${msg("历史数据")} · ${metricName(metric)}`;
      historyTable.heading.replaceChildren(...[msg("年份"), ...series.map((entry) => countryName(entry.country))].map((name) => {
        const heading = element("th", "", name);
        heading.scope = "col";
        return heading;
      }));
      historyTable.body.replaceChildren(...years.map((year, index) => {
        const row = element("tr", year === snapshot.year ? "oe-current-year" : "");
        const heading = element("th", "oe-number", formatYear(year));
        heading.scope = "row";
        if (year === snapshot.year) heading.setAttribute("aria-current", "true");
        row.append(heading, ...series.map((entry) => valueCell(entry.values[index])));
        return row;
      }));
    }

    if (!values.length) {
      const message = msg(!metric || !years.length ? "暂无可用指标或年份。" : primary
        ? "所选地区在此指标下没有历史观测。"
        : "选择地区一查看历史，可加入地区二进行比较。");
      drawGrid(history, [], [], message);
      return;
    }
    const start = years[0];
    const end = years.at(-1);
    const yearAt = (year) => start === end ? 50 : plotPosition((year - start) / (end - start));
    const ticks = years.filter((year) => year === start || year === end
      || (year % 20 === 0 && year - start >= 10 && end - year >= 10));
    const scale = numericScale(values);
    drawGrid(history, ticks.map((year) => ({ at: yearAt(year), label: formatYear(year) })), scale.ticks);
    const mark = percent(yearAt(snapshot.year));
    history.drawing.append(graphic("line", { x1: mark, x2: mark, y1: 0, y2: "100%", class: "oe-year-marker" }));
    const curves = graphic("svg", { width: "100%", height: "100%", viewBox: "0 0 100 100", preserveAspectRatio: "none" });
    const markers = graphic("g", {});
    for (const [index, entry] of series.entries()) {
      let path = "";
      entry.values.forEach((value, offset) => {
        if (value === null) return;
        const year = years[offset];
        const left = yearAt(year);
        const top = 100 - scale.position(value);
        const connectsBefore = offset > 0 && years[offset - 1] === year - 1 && entry.values[offset - 1] !== null;
        const connectsAfter = offset < years.length - 1 && years[offset + 1] === year + 1 && entry.values[offset + 1] !== null;
        path += `${connectsBefore ? "L" : "M"}${left},${top}`;
        if ((!connectsBefore && !connectsAfter) || year === snapshot.year) {
          markers.append(graphic("circle", {
            cx: percent(left), cy: percent(top), r: 3.6, class: `oe-trend-dot oe-trend-${index}`,
          }));
        }
      });
      if (path) curves.append(graphic("path", { d: path, class: `oe-trend oe-trend-${index}`, "vector-effect": "non-scaling-stroke" }));
    }
    history.drawing.append(curves, markers);
  }

  function syncSelection() {
    const primary = countryFrom(primaryField.select);
    if (!primary || compareField.select.value === primaryField.select.value) compareField.select.value = "";
    compareField.select.disabled = !primary || countries.length < 2;
    for (const option of compareField.select.options) {
      option.disabled = Boolean(primary) && option.value === primaryField.select.value;
    }
    const comparison = countryFrom(compareField.select);
    locate.disabled = !primary;
    selection.textContent = primary ? msg("已选 {country}", { country: countryName(primary) }) : msg("尚未选择地区");
    for (const [id, control] of tableButtons) control.setAttribute("aria-pressed", String(id === primary?.id));
    for (const { dot, row } of points) {
      const selected = row.country.id === primary?.id;
      const compared = row.country.id === comparison?.id;
      dot.classList.toggle("oe-selected-dot", selected);
      dot.classList.toggle("oe-compare-dot", compared);
      if (selected || compared) scatter.drawing.append(dot);
    }
    updatePointReadout();
    renderHistory();
  }

  function selectCountry(country) {
    primaryField.select.value = String(country.id);
    previewPoint(undefined);
    syncSelection();
  }

  function refresh() {
    const xMetric = metrics[xField.select.selectedIndex];
    const yMetric = metrics[yField.select.selectedIndex];
    const year = years[yearField.select.selectedIndex];
    const continent = continents[continentField.select.selectedIndex - 1];
    const rows = countries.filter((country) => continent === undefined || (country.continent ?? "") === continent).map((country) => {
      const x = read(country, xMetric, year);
      return { country, x, y: yMetric === xMetric ? x : read(country, yMetric, year) };
    });
    snapshot = {
      xMetric, yMetric, year, rows,
      rowsById: new Map(rows.map((row) => [row.country.id, row])),
      paired: rows.filter((row) => row.x !== null && row.y !== null),
    };
    const axes = [["x", msg("横轴"), xMetric], ["y", msg("纵轴"), yMetric]];
    sourceList.replaceChildren(...axes.map(([key, label, metric], index) => {
      sortHeaders.get(key).label.textContent = `${label} · ${metricName(metric)}`;
      historyField.select.options[index].textContent = `${label} · ${metricName(metric)}`;
      const source = element("li");
      source.append(element("strong", "", `${label} · ${metricName(metric)}`));
      if (metric?.code) {
        const link = element("a", "", `${msg("世界银行")} · ${metric.code}`);
        link.href = `https://data.worldbank.org/indicator/${encodeURIComponent(metric.code)}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        source.append(link);
      }
      if (metric?.description) source.append(element("p", "oe-note", msg(metric.description)));
      return source;
    }));
    lensX.disabled = !xMetric || year === undefined;
    lensY.disabled = !yMetric || year === undefined;
    exportYear.disabled = !xMetric || !yMetric || year === undefined || !rows.length;
    exportAll.disabled = !metrics.length || !years.length || !countries.length;
    renderScatter();
    renderCurrentTable();
    syncSelection();
  }

  for (const control of [xField.select, yField.select, yearField.select, continentField.select]) {
    control.addEventListener("change", refresh);
  }
  for (const { select } of [primaryField, compareField, historyField]) {
    select.addEventListener("change", () => {
      previewPoint(undefined);
      syncSelection();
    });
  }
  for (const [key, { control }] of sortHeaders) {
    control.addEventListener("click", () => {
      ascending = key === sortKey ? !ascending : key === "country";
      sortKey = key;
      renderCurrentTable();
      currentTable.wrapper.scrollTop = 0;
    });
  }
  scatter.plot.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "touch") previewPoint(nearestPoint(event));
  });
  scatter.plot.addEventListener("pointerleave", () => previewPoint(undefined));
  scatter.plot.addEventListener("click", (event) => {
    const point = nearestPoint(event);
    if (point) selectCountry(point.row.country);
  });
  locate.addEventListener("click", async () => {
    const country = countryFrom(primaryField.select);
    if (!country) return;
    await ctx.onSelect(country.id);
    closeHostDialog(host);
  });
  lensX.addEventListener("click", () => ctx.onLens(snapshot.xMetric.id, snapshot.year));
  lensY.addEventListener("click", () => ctx.onLens(snapshot.yMetric.id, snapshot.year));
  exportYear.addEventListener("click", () => {
    const { year, rows, xMetric, yMetric } = snapshot;
    downloadCsv(
      `orbis-atlas-${year}.csv`,
      [...csvHeaders, `${msg("横轴")} · ${metricColumn(xMetric)}`, `${msg("纵轴")} · ${metricColumn(yMetric)}`],
      rows.map((row) => [...countryCells(row.country, year), row.x, row.y]),
    );
  });
  exportAll.addEventListener("click", () => {
    function* allRows() {
      for (const country of countries) {
        for (const year of years) {
          yield [...countryCells(country, year), ...metrics.map((metric) => read(country, metric, year))];
        }
      }
    }
    downloadCsv("orbis-atlas-all.csv", [...csvHeaders, ...metrics.map(metricColumn)], allRows());
  });
  refresh();
}
