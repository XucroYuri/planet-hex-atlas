import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { LOCALES } from '../web/js/i18n.js';
import shell from '../web/i18n/shell.js';
import geography from '../web/i18n/geography.js';
import profiles from '../web/i18n/profiles.js';
import explorer from '../web/i18n/explorer.js';
import simulation from '../web/i18n/simulation.js';
import council from '../web/i18n/council.js';
import standards from '../web/i18n/standards.js';

const rows = [...shell, ...geography, ...profiles, ...explorer, ...simulation, ...council, ...standards];
const placeholders = text => [...new Set(text.match(/\{[a-z]\w*\}/gi) || [])].sort();
for (const locale of LOCALES.filter(item => item.machine)) {
  test(`${locale.tag} generated pack covers authored keys and preserves placeholders`, async () => {
    const payload = JSON.parse(await readFile(new URL(`../web/locales/${locale.tag}.json`, import.meta.url)));
    assert.equal(payload.locale, locale.tag);
    assert.equal(payload.method, 'M2M100 offline translation');
    assert.ok(payload.entries['寰宇图志'] && payload.entries['寰宇图志'] === payload.entries['寰宇图志 · Orbis Atlas']);
    for (const [source] of rows) {
      const translation = payload.entries[source];
      assert.ok(typeof translation === 'string' && translation.trim(), source);
      assert.deepEqual(placeholders(translation), placeholders(source), source);
    }
  });
}
