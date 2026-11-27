import shell from '../i18n/shell.js';
import standards from '../i18n/standards.js';

export const LOCALES = Object.freeze([
  { tag: 'zh-CN', label: '简体中文', dir: 'ltr' },
  { tag: 'en', label: 'English', dir: 'ltr' },
  { tag: 'zh-TW', label: '繁體中文', dir: 'ltr' },
  { tag: 'es', label: 'Español', dir: 'ltr' },
  { tag: 'fr', label: 'Français', dir: 'ltr' },
  { tag: 'ja', label: '日本語', dir: 'ltr' },
  { tag: 'ko', label: '한국어', dir: 'ltr' },
  { tag: 'ar', label: 'العربية', dir: 'rtl' },
  { tag: 'de', label: 'Deutsch · MT', dir: 'ltr', machine: true },
  { tag: 'pt', label: 'Português · MT', dir: 'ltr', machine: true },
  { tag: 'hi', label: 'हिन्दी · MT', dir: 'ltr', machine: true },
  { tag: 'ru', label: 'Русский · MT', dir: 'ltr', machine: true },
  { tag: 'id', label: 'Bahasa Indonesia · MT', dir: 'ltr', machine: true },
  { tag: 'it', label: 'Italiano · MT', dir: 'ltr', machine: true },
  { tag: 'tr', label: 'Türkçe · MT', dir: 'ltr', machine: true },
  { tag: 'vi', label: 'Tiếng Việt · MT', dir: 'ltr', machine: true },
  { tag: 'bn', label: 'বাংলা · MT', dir: 'ltr', machine: true },
  { tag: 'uk', label: 'Українська · MT', dir: 'ltr', machine: true },
  { tag: 'pl', label: 'Polski · MT', dir: 'ltr', machine: true },
  { tag: 'fa', label: 'فارسی · MT', dir: 'rtl', machine: true },
  { tag: 'ur', label: 'اردو · MT', dir: 'rtl', machine: true },
  { tag: 'sw', label: 'Kiswahili · MT', dir: 'ltr', machine: true },
  { tag: 'nl', label: 'Nederlands · MT', dir: 'ltr', machine: true },
  { tag: 'th', label: 'ไทย · MT', dir: 'ltr', machine: true },
  { tag: 'he', label: 'עברית · MT', dir: 'rtl', machine: true },
  { tag: 'el', label: 'Ελληνικά · MT', dir: 'ltr', machine: true },
  { tag: 'cs', label: 'Čeština · MT', dir: 'ltr', machine: true },
  { tag: 'ro', label: 'Română · MT', dir: 'ltr', machine: true },
  { tag: 'hu', label: 'Magyar · MT', dir: 'ltr', machine: true },
  { tag: 'sv', label: 'Svenska · MT', dir: 'ltr', machine: true },
  { tag: 'da', label: 'Dansk · MT', dir: 'ltr', machine: true },
  { tag: 'fi', label: 'Suomi · MT', dir: 'ltr', machine: true },
  { tag: 'no', label: 'Norsk · MT', dir: 'ltr', machine: true },
  { tag: 'bg', label: 'Български · MT', dir: 'ltr', machine: true },
  { tag: 'hr', label: 'Hrvatski · MT', dir: 'ltr', machine: true },
  { tag: 'sk', label: 'Slovenčina · MT', dir: 'ltr', machine: true },
  { tag: 'sl', label: 'Slovenščina · MT', dir: 'ltr', machine: true },
  { tag: 'lt', label: 'Lietuvių · MT', dir: 'ltr', machine: true },
  { tag: 'lv', label: 'Latviešu · MT', dir: 'ltr', machine: true },
  { tag: 'et', label: 'Eesti · MT', dir: 'ltr', machine: true },
  { tag: 'ta', label: 'தமிழ் · MT', dir: 'ltr', machine: true },
].map(Object.freeze));

const localesByTag = new Map(LOCALES.map((entry, index) => [entry.tag, index]));
const messages = new Map([...shell, ...standards].map(row => [row[0], row]));
const preferenceKey = 'orbis-atlas.locale';

export function matchLocale(tag) {
  if (typeof tag !== 'string' || !tag) return null;
  try {
    const { baseName, language, script, region } = new Intl.Locale(tag);
    if (language === 'zh') {
      if (script === 'Hant') return 'zh-TW';
      if (script === 'Hans') return 'zh-CN';
      return ['TW', 'HK', 'MO'].includes(region) ? 'zh-TW' : 'zh-CN';
    }
    if (localesByTag.has(baseName)) return baseName;
    return localesByTag.has(language) ? language : null;
  } catch {
    return null;
  }
}

export function resolveLocale(query, saved, browserLanguages = []) {
  for (const candidate of [query, saved, ...browserLanguages]) {
    const match = matchLocale(candidate);
    if (match) return match;
  }
  return 'en';
}

function browserLocale(browser) {
  let saved;
  try { saved = browser.localStorage.getItem(preferenceKey); } catch {}
  return resolveLocale(
    new URLSearchParams(browser.location.search).get('lang'),
    saved,
    browser.navigator.languages?.length ? browser.navigator.languages : [browser.navigator.language],
  );
}

const locale = typeof window === 'undefined' ? 'zh-CN' : browserLocale(window);
const index = localesByTag.get(locale);

export function getLocale() {
  return locale;
}

export function saveLocalePreference(tag) {
  const match = matchLocale(tag);
  if (match) {
    try { window.localStorage.setItem(preferenceKey, match); } catch {}
  }
  return match;
}

let supplemental = {};
export async function loadLocalePack() {
  if (locale === 'zh-CN' || locale === 'en') return;
  try {
    const response = await fetch(new URL(`../locales/${locale}.json`, import.meta.url));
    if (!response.ok) throw Error('Locale file unavailable');
    const data = await response.json();
    if (data.locale !== locale || !data.entries || typeof data.entries !== 'object') throw Error('Invalid locale file');
    supplemental = data.entries;
  } catch (error) {
    console.warn('Locale supplemental dictionary unavailable; English fallback is active.', error);
  }
}

export function t(zh, en) {
  const row = messages.get(zh);
  if (index === 0) return zh;
  if (index < 8 && row?.[index]) return row[index];
  return supplemental[zh] ?? en ?? row?.[1] ?? zh;
}

export function registerMessages(rows) {
  for (const row of rows) messages.set(row[0], row);
}

export function msg(source, values) {
  const text = t(source);
  return values ? text.replace(/\{([a-z]\w*)\}/gi, (token, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : token) : text;
}

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const htmlText = (source, values) => esc(msg(source, values));

const formatters = new Map();
export function numberFormat(options = {}) {
  const settings = ['ar','fa','ur'].includes(locale) ? { numberingSystem: 'arab', ...options } : options;
  const key = JSON.stringify(settings);
  if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat(locale, settings));
  return formatters.get(key);
}

const whole = numberFormat({ maximumFractionDigits: 0 });
const year = numberFormat({ useGrouping: false, maximumFractionDigits: 0 });
const percent = numberFormat({ style: 'percent', maximumFractionDigits: 2 });

export const formatCount = (value) => whole.format(value);
export const formatYear = (value) => year.format(value);
export const formatPercent = (value) => percent.format(value / 100);
export const yearLabel = (value) => msg('{year} 年', { year: formatYear(value) });

export function localizePage(document) {
  const { tag, dir } = LOCALES[index];
  document.documentElement.lang = tag;
  document.documentElement.dir = dir;
  document.documentElement.dataset.translation = LOCALES[index].machine ? 'machine' : 'curated';
  document.title = msg(document.title);
  for (const node of document.querySelectorAll('[data-i18n], [data-i18n-attrs]')) {
    if (node.hasAttribute('data-i18n')) node.textContent = msg(node.textContent.trim());
    for (const attribute of (node.dataset.i18nAttrs || '').split(/\s+/).filter(Boolean)) {
      if (node.hasAttribute(attribute)) node.setAttribute(attribute, msg(node.getAttribute(attribute)));
    }
  }
  const menu = document.getElementById('language');
  const curated = document.createElement('optgroup');
  curated.label = msg('人工整理');
  const machine = document.createElement('optgroup');
  machine.label = msg('机器翻译 · MT');
  for (const entry of LOCALES) {
    const option = document.createElement('option');
    option.value = entry.tag;
    option.lang = entry.tag;
    option.dir = entry.dir;
    option.textContent = entry.label;
    if (entry.machine) option.title = 'Machine translation';
    (entry.machine ? machine : curated).append(option);
  }
  menu.replaceChildren(curated, machine);
  menu.value = tag;
}
