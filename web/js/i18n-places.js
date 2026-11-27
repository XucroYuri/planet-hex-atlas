import { getLocale, msg, registerMessages } from './i18n.js';
import cityLabels from '../i18n/cities.js';
import geography from '../i18n/geography.js';

registerMessages(geography);

const locale = getLocale();
const regionNames = new Map();
const countries = new WeakMap();
const aliases = new WeakMap();
const cityAliases = new WeakMap();
const compositeRegions = new Set(['ATC', 'CSI', 'IOA', 'BRI', 'CLP', 'KAB']);
const continents = new Map([
  ['asia', '亚洲'], ['europe', '欧洲'], ['africa', '非洲'], ['oceania', '大洋洲'],
  ['north america', '北美洲'], ['south america', '南美洲'], ['antarctica', '南极洲'],
  ['seven seas (open ocean)', '远洋岛屿'],
]);

export function regionName(code, language = locale) {
  if (!/^[a-z]{2}$/i.test(code || '') || typeof Intl.DisplayNames !== 'function') return '';
  if (!regionNames.has(language)) {
    regionNames.set(language, new Intl.DisplayNames(language, { type: 'region', fallback: 'none' }));
  }
  return regionNames.get(language).of(code.toUpperCase()) || '';
}

export function countryName(country) {
  if (!country) return '';
  if (!countries.has(country)) {
    const source = country.name || country.zh || country.id || '';
    const name = locale === 'zh-CN' ? country.zh || source
      : compositeRegions.has(country.id) ? source : regionName(country.iso2) || source;
    countries.set(country, name);
  }
  return countries.get(country);
}

export function cityName(city) {
  if (locale === 'zh-CN') return city[2] || city[1];
  return cityLabels[city[0]]?.[locale] || city[1] || city[2];
}

export const siteName = (site) =>
  (site[1] === 3 && locale !== 'zh-CN' ? site[8] : '') || site[2] || site[0];

export function searchKey(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase(locale)
    .normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
    .replace(/[’‘]/g, "'").replace(/[أإآٱ]/g, 'ا').replace(/[\u0640\u064B-\u065F]/g, '').trim();
}

export function countrySearchNames(country) {
  if (!aliases.has(country)) {
    aliases.set(country, [...new Set([
      countryName(country), country.zh, country.name, country.id, country.iso2, country.wdi,
    ].map(searchKey).filter(Boolean))]);
  }
  return aliases.get(country);
}

export function citySearchNames(city) {
  if (!cityAliases.has(city)) {
    cityAliases.set(city, [...new Set([
      cityName(city), city[1], city[2], ...Object.values(cityLabels[city[0]] || {}),
    ].map(searchKey).filter(Boolean))]);
  }
  return cityAliases.get(city);
}
export const continentName = (name) => msg(continents.get(name?.toLowerCase()) || name || '洲别未标注');
