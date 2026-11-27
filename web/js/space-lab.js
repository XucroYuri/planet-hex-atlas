import { esc, load } from './data.js';

const CREW = 'https://www.nasa.gov/news-release/nasa-welcomes-record-setting-artemis-ii-moonfarers-back-to-earth/';
const HORIZONS = 'https://ssd.jpl.nasa.gov/horizons/';
const EVENTS = [
  [1957,'人造卫星 1 号进入地球轨道','Sputnik 1 entered Earth orbit','https://www.nasa.gov/history/sputnik/'],
  [1961,'东方 1 号首次载人绕地飞行','Vostok 1 carried the first human into Earth orbit','https://www.nasa.gov/history/60-years-ago-the-first-human-in-space/'],
  [1969,'阿波罗 11 号载人登月','Apollo 11 landed people on the Moon','https://www.nasa.gov/history/july-20-1969-one-giant-leap-for-mankind/'],
  [1976,'海盗 1 号在火星表面开始探测','Viking 1 began its surface mission on Mars','https://science.nasa.gov/mission/viking-1/'],
  [1977,'两艘旅行者探测器启程','Both Voyager spacecraft launched','https://science.nasa.gov/mission/voyager/'],
  [2000,'国际空间站开始持续载人驻留','Continuous human occupation of the ISS began','https://www.nasa.gov/international-space-station/'],
  [2005,'惠更斯号着陆土卫六','Huygens landed on Titan','https://science.nasa.gov/mission/cassini-huygens/'],
  [2012,'旅行者 1 号越过日球层顶','Voyager 1 crossed the heliopause','https://science.nasa.gov/mission/voyager/voyager-1/'],
  [2015,'新视野号飞掠冥王星','New Horizons flew past Pluto','https://science.nasa.gov/mission/new-horizons/'],
  [2023,'OSIRIS-REx 将小行星样本带回地球','OSIRIS-REx returned an asteroid sample to Earth','https://science.nasa.gov/mission/osiris-rex/'],
  [2026,'阿尔忒弥斯 II 创下载人离地距离纪录','Artemis II set the crewed distance record from Earth',CREW],
];
const SVG = 'http://www.w3.org/2000/svg';
const EARTH_RECORD_KM = 252756 * 1.609344;
const C_KMS = 299792.458;
let pending;

export function positionAt(body, year) { return body.positions.find((row) => row[0] === year) || null; }
export function orbitalDistances(point, earth, auKm) {
  const solar = Math.hypot(...point.slice(1));
  const terrestrial = Math.hypot(point[1]-earth[1], point[2]-earth[2], point[3]-earth[3]);
  return { solar, terrestrial, lightHours: terrestrial*auKm/C_KMS/3600 };
}
function svg(tag, attributes, text) {
  const element = document.createElementNS(SVG, tag);
  for (const [k,v] of Object.entries(attributes)) element.setAttribute(k,String(v));
  if (text !== undefined) element.textContent=text;
  return element;
}

export async function renderSpace(host, ctx) {
  const t = ctx.t;
  const locale = ctx.locale || 'zh-CN';
  const f = new Intl.NumberFormat(locale,{maximumFractionDigits:2});
  const integer = new Intl.NumberFormat(locale,{maximumFractionDigits:0});
  const number = (value) => f.format(value);
  const label = (b) => t(b.zh,b.en);
  host.textContent = t('载入星历…','Loading ephemerides…');
  if (!pending) pending = load('space/ephemeris.json').catch((err) => {pending=null;throw err;});
  const archive = await pending;
  const bodies = archive.objects;
  const lastYear = Number(archive.issue.slice(0,4));
  let year = lastYear;
  let selected = 'voyager1';
  let signalYear = 1974;
  host.className = 'space-lab';
  host.innerHTML = `<p class="space-intro">${esc(t('从地球轨道到星际空间。比较探测器的实际任务、星历位置与人类载人飞行的距离纪录。','From Earth orbit to interstellar space. Explore spacecraft missions, their dated ephemerides and the crewed distance record.'))}</p>
    <div class="space-controls"><label>${esc(t('星历年份','Ephemeris year'))}<input type="range" name="space-year" min="1957" max="${lastYear}" value="${year}"></label><output data-year></output><label>${esc(t('天体或探测器','Body or spacecraft'))}<select name="space-body"></select></label></div>
    <div class="space-layout"><figure class="space-plot"><svg viewBox="0 0 560 400" role="img" aria-label="${esc(t('日心黄道面位置图','Heliocentric ecliptic chart'))}"></svg><figcaption>${esc(t('日心黄道面俯视图。地面投影半径采用对数刻度，虚线连接探测器的年度样本。','Ecliptic-plane view. Projected radius uses a logarithmic scale. Dashed tracks connect annual spacecraft samples.'))}</figcaption></figure><div data-details></div></div>
    <div class="space-boundaries"><article><h3>${esc(t('载人离地纪录','Crewed distance record'))}</h3><strong>${integer.format(EARTH_RECORD_KM)} km</strong><p>${esc(t('2026 年 4 月，阿尔忒弥斯 II。NASA 公布的最远离地距离为 252,756 英里。','Artemis II, April 2026. NASA reported a maximum distance of 252,756 miles from Earth.'))}</p><a href="${CREW}" target="_blank" rel="noopener">NASA ↗</a></article>
    <article><h3>${esc(t('理想光信号前沿','Ideal light-signal front'))}</h3><strong data-light></strong><label>${esc(t('假设发射年份','Assumed emission year'))}<input name="signal-year" type="number" min="1800" max="${lastYear}" value="${signalYear}"></label><p>${esc(t('思考实验：到所选星历年，真空中每经过一年光前进一光年。实际天线方向、衰减和电离层影响可探测范围。','Thought experiment: light travels one light-year per year in vacuum until the selected epoch. Direction, attenuation and the ionosphere affect detectability.'))}</p></article></div>
    <section><h3>${esc(t('人类活动记录','Human activity record'))}</h3><ol class="space-events" data-events></ol></section>
    <details class="space-method"><summary>${esc(t('坐标、依据与数据边界','Coordinates, provenance and coverage'))}</summary><p>${esc(t('各年取 11 月 27 日 00:00 TDB。坐标为 J2000 黄道面的日心几何位置，距离使用三维向量计算。历史轨迹来自 JPL 星历模型；探测器失联后仍可有轨道估计。没有覆盖的年份留空。','Each sample is taken on November 27 at 00:00 TDB. Heliocentric positions use the J2000 ecliptic frame; distances use all three coordinates. JPL ephemerides are modeled trajectories and may extend beyond last contact. Missing years are left empty.'))}</p><a href="${HORIZONS}" target="_blank" rel="noopener">NASA/JPL Horizons ↗</a></details>`;
  const sel = host.querySelector('[name=space-body]');
  for (const b of [...bodies].sort((a,b) => a.kind === b.kind ? 0 : a.kind==='probe' ? -1 : 1)) sel.add(new Option(label(b), b.id));
  const chart = host.querySelector('svg');
  const projection = (row) => {
    const len = Math.hypot(row[1],row[2]);
    const radius = Math.log1p(len)/Math.log(201) * 162;
    return [280 + row[1]/(len||1)*radius, 200-row[2]/(len||1)*radius];
  };
  function displaySignal() {
    const input = host.querySelector('[name=signal-year]');
    const y = input.valueAsNumber;
    signalYear = Number.isInteger(y) && y>=1800 && y<=lastYear ? y : null;
    host.querySelector('[data-light]').textContent = signalYear===null ? '—' : `${integer.format(Math.max(0,year-signalYear))} ${t('光年','ly')}`;
  }
  function draw() {
    const current = bodies.filter((b) => positionAt(b,year));
    if (!current.some(b=>b.id===selected)) selected = current.find(b=>b.kind==='probe')?.id || 'earth';
    for (const opt of sel.options) opt.disabled = !current.some(b=>b.id===opt.value);
    sel.value=selected;
    host.querySelector('[data-year]').textContent=year;
    displaySignal();
    const grid = svg('g',{class:'space-grid'});
    for (const ua of [1,5,30,100,200]) {
      const r=Math.log1p(ua)/Math.log(201)*162;
      grid.append(svg('circle',{cx:280,cy:200,r}),svg('text',{x:285,y:197-r},`${ua} AU`));
    }
    grid.append(svg('path',{d:'M75 200 H485 M280 20 V380'}));
    chart.replaceChildren(grid);
    const earth = positionAt(bodies.find(b=>b.id==='earth'),year);
    const chosen = current.find(b=>b.id===selected);
    for (const b of current) {
      const point = positionAt(b,year);
      const [x,y]=projection(point);
      const group=svg('g',{'data-object':b.id,class:`space-object ${b.kind} ${b.id===selected?'chosen':''}`});
      if (b.kind==='probe') {
        const path=b.positions.filter(p=>p[0]<=year).map((p,i)=>`${i?'L':'M'}${projection(p).map(n=>n.toFixed(2)).join(' ')}`).join(' ');
        chart.append(svg('path',{d:path,class:'space-trail'}));
      }
      const dist=orbitalDistances(point,earth,archive.auKm);
      group.append(svg('title',{},`${label(b)} · ${number(dist.solar)} AU`));
      if (b.kind==='probe') group.append(svg('path',{d:`M${x} ${y-5} l5 5 -5 5 -5 -5 z`}));
      else group.append(svg('circle',{cx:x,cy:y,r:b.id==='earth'?4.5:3}));
      if (b.id===selected) {
        group.append(svg('circle',{cx:x,cy:y,r:9,class:'space-selected'}));
        group.append(svg('text',{x:x+12,y:y-7},label(b)));
      }
      group.addEventListener('click',()=>{selected=b.id;draw();});
      chart.append(group);
    }
    chart.append(svg('circle',{cx:280,cy:200,r:4,class:'space-sun'}));
    const point=positionAt(chosen,year), dist=orbitalDistances(point,earth,archive.auKm);
    const entries=[[t('距太阳','From Sun'),`${number(dist.solar)} AU`],[t('距地球','From Earth'),`${number(dist.terrestrial)} AU`],[t('单程光行时','One-way light time'),`${number(dist.lightHours)} h`],[t('黄道面外高度','Height above ecliptic'),`${number(point[3])} AU`]];
    host.querySelector('[data-details]').innerHTML=`<h3>${esc(label(chosen))}</h3><p>${esc(t('星历采样','Ephemeris sample'))} · ${year}-11-27 TDB</p><dl>${entries.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><a href="${esc(chosen.missionUrl)}" target="_blank" rel="noopener">NASA ↗</a> <a href="${esc(chosen.source)}" target="_blank" rel="noopener">JPL ↗</a>`;
    host.querySelector('[data-events]').innerHTML=EVENTS.filter(e=>e[0]<=year).map(([yr,zh,en,url])=>`<li><time>${yr}</time><a href="${url}" rel="noopener" target="_blank">${esc(t(zh,en))} ↗</a></li>`).join('');
  }
  host.querySelector('[name=space-year]').oninput=(e)=>{year=Number(e.target.value);draw();};
  host.querySelector('[name=signal-year]').oninput=displaySignal;
  sel.onchange=()=>{selected=sel.value;draw();};
  draw();
}
