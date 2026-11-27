import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = fileURLToPath(new URL('server.mjs', import.meta.url));

async function open(role) {
  const client = new Client({name:'atlas-regression',version:'1.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],env:{ORBIS_ROLE:role}}));
  return client;
}

async function call(client, name, args) {
  const r = await client.callTool({name, arguments:args});
  assert.equal(Boolean(r.isError), false, r.content[0]?.text);
  return r.structuredContent;
}

test('stdio exposes exact measurements, immutable action logs and role-filtered turn history', async () => {
  const a = await open('workers');
  const b = await open('residents');
  try {
    assert.equal((await a.listTools()).tools.length, 6);
    const cities = await call(a,'orbis_search',{dataset:'regions',query:'CHN'});
    assert.equal(cities.rows[0].id,'CHN');
    const missing = await call(a,'orbis_read_observations',{region:'ATA', year:2023, metrics:['pop']});
    assert.equal(missing.rows[0].value,null);
    const origin = {region:'CHN',year:2023,seed:8,actions:[]};
    const legal = await call(a,'orbis_check_proposal',{log:origin,policy:'services'});
    assert.equal(legal.ok,true);
    const branch = await call(a,'orbis_advance_council',{log:origin,policy:'services'});
    assert.deepEqual(branch.log.actions,['services']);
    assert.equal(branch.log.modelVersion,1);
    const repeat = await call(a,'orbis_observe_council',{log:branch.log});
    assert.deepEqual(repeat,branch);
    const other = await call(b,'orbis_observe_council',{log:branch.log});
    assert.equal(other.observation.role,'residents');
    assert.notDeepEqual(other.observation.beliefs, branch.observation.beliefs);
    assert.ok(!('circles' in other.observation));
    const turns = await call(b,'orbis_read_turns',{log:branch.log,offset:0,limit:1});
    assert.equal(turns.rows[0].policy,'services');
    const denied = await a.callTool({name:'orbis_advance_council',arguments:{log:{...origin,actions:['industry','industry','industry']},policy:'industry'}});
    assert.equal(denied.isError,true);
    const hundred = await call(a,'orbis_observe_council',{log:{...origin, actions:Array(100).fill('hold')}});
    assert.equal(hundred.observation.year,2123);
    assert.equal(hundred.recentHistory.length,3);
  } finally { await Promise.all([a.close(),b.close()]); }
});
