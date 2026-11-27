import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { orbitalDistances, positionAt } from '../web/js/space-lab.js';

const data=JSON.parse(await readFile(new URL('../web/data/space/ephemeris.json',import.meta.url)));

test('NASA ephemeris covers dated planets and deep-space missions',()=>{
  assert.equal(data.frame,'Heliocentric ecliptic J2000; geometric Cartesian AU');
  for (const body of data.objects) {
    assert.equal(body.sha256.length,64);
    assert.ok(body.source.startsWith('https://ssd.jpl.nasa.gov/api/horizons.api?'));
    for (const position of body.positions) assert.equal(position.length,4);
  }
  const probe=data.objects.find(x=>x.id==='voyager1');
  assert.equal(positionAt(probe,1976),null);
  assert.ok(positionAt(probe,2026));
  const earth=positionAt(data.objects.find(x=>x.id==='earth'),2026);
  const distance=orbitalDistances(positionAt(probe,2026),earth,data.auKm);
  assert.ok(distance.terrestrial>170 && distance.terrestrial<175);
  assert.ok(distance.lightHours>23 && distance.lightHours<26);
});
