import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createCouncil, observeCouncil, checkProposal, advanceCouncil, COUNCIL_MODEL_VERSION } from '../web/js/council-model.js';

// Each process has one role. Clients sharing an experiment replay the same public action log.
// The raw simulated world and other circles' observations are never returned by the server.
const role = process.env.ORBIS_ROLE || 'residents';
if (!['residents', 'workers', 'stewards'].includes(role)) throw new Error('ORBIS_ROLE must be residents, workers or stewards');
const data = (name) => readFile(new URL(`../web/data/${name}`, import.meta.url), 'utf8').then(JSON.parse);
const [atlas, observations] = await Promise.all([data('atlas.json'), data('observations.json')]);
const regions = new Map(atlas.countries.map((c) => [c.id, c]));
const metrics = new Map(atlas.metrics.map((m) => [m.id, m]));
const year = z.number().int().min(atlas.years[0]).max(atlas.years.at(-1)).describe('Exact WDI observation year');
const region = z.string().length(3).describe('Three-letter atlas region id, e.g. CHN. Use orbis_search first.');
const policy = z.enum(['services', 'industry', 'ecology', 'survey', 'hold']);
const seed = z.union([z.number().int().safe(), z.string().trim().min(1).max(80)]);
const logSchema = z.object({modelVersion: z.literal(COUNCIL_MODEL_VERSION).default(COUNCIL_MODEL_VERSION), region, year, seed, actions: z.array(policy).max(100)}).strict();
const limit = z.number().int().min(1).max(50).default(15);
const offset = z.number().int().min(0).default(0);
const read = (id, key, at) => observations[id]?.[key]?.[at - atlas.years[0]] ?? null;
const result = (payload) => ({ content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload });
const server = new McpServer({ name: 'orbis-atlas-mcp-server', version: '1.0.0' });
const local = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function register(name, description, inputSchema, handler) {
  server.registerTool(name, { description, inputSchema, annotations: local }, async (args) => {
    try { return result(await handler(args)); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: String(error.message || error) }] }; }
  });
}

function page(rows, start, size) {
  const next = start + size;
  return { total_count: rows.length, next_offset: next < rows.length ? next : null, rows: rows.slice(start, next) };
}

function replay(log) {
  if (!regions.has(log.region)) throw Error('Unknown region. Query orbis_search for its id.');
  let state = createCouncil({region: log.region, year: log.year, seed: log.seed, urban: read(log.region,'urban',log.year), electric: read(log.region,'electric',log.year)});
  for (const [index, action] of log.actions.entries()) {
    const checked = checkProposal(state, action);
    if (!checked.ok) throw Error(`Invalid action at turn ${index + 1}: ${checked.reason}`);
    state = advanceCouncil(state, action);
  }
  return state;
}

function projected(log, state) {
  const {history, ...current} = observeCouncil(state, role);
  return { role, turns: log.actions.length, log, observation: current, recentHistory: history.slice(-3), status: 'hypothetical' };
}

register('orbis_search', 'Find atlas region ids or measured indicators by id, Chinese label or English name. Results are paginated.',
  { dataset: z.enum(['regions','indicators']), query: z.string().max(100).default(''), offset, limit },
  ({ dataset, query, offset, limit }) => {
    const needle = query.trim().toLowerCase();
    const rows = dataset === 'regions' ? atlas.countries.map(({ id, zh, name, wdi }) => ({id, zh, name, wdi})) : atlas.metrics.map(({ id, name, unit, code }) => ({id, name, unit, code}));
    return page(rows.filter((row) => Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(needle))), offset, limit);
  });

register('orbis_read_observations', 'Return exact-year World Bank measurements, units and source links. A missing observation has value null. WLD requests the published world aggregate.',
  { region, year, metrics: z.array(z.string().min(1).max(32)).min(1).max(12) },
  ({ region, year, metrics: keys }) => {
    if (!regions.has(region) && region !== 'WLD') throw Error('Unknown region. Query orbis_search.');
    const rows = keys.map((key) => {
      const m = metrics.get(key);
      if (!m) throw Error(`Unknown metric '${key}'. Query orbis_search with dataset=indicators.`);
      return {id:key,name:m.name,value:read(region,key,year),unit:m.unit,source:`https://data.worldbank.org/indicator/${m.code}`};
    });
    return {region, year, status:'observed', rows};
  });

register('orbis_observe_council', 'Replay a local hypothetical experiment and return only the process role’s observation. Start with an empty actions array. A log is immutable and can be forked.',
  { log: logSchema }, ({log}) => projected(log, replay(log)));

register('orbis_read_turns', 'Read a page of this role’s local history, including received signals and delayed receipts. The offset is zero-based.',
  { log: logSchema, offset, limit: z.number().int().min(1).max(10).default(3) }, ({log, offset, limit}) => {
    const {history} = observeCouncil(replay(log), role);
    return {role, ...page(history, offset, limit)};
  });

register('orbis_check_proposal', 'Check the deterministic policy budget and acceptance rules without advancing time. The returned reason is a public feasibility signal.',
  { log: logSchema, policy }, ({log, policy}) => {
    const state = replay(log);
    const checked = checkProposal(state, policy);
    return {policy, ok:Boolean(checked.ok), reason:String(checked.reason || ''), turns:log.actions.length};
  });

register('orbis_advance_council', 'Apply one legal policy and return a new replayable log and the role-filtered next observation. Input is unchanged. The experiment ends at 100 turns.',
  { log: logSchema, policy }, ({log, policy}) => {
    if (log.actions.length >= 100) throw Error('100 turns reached. Start another log or fork an earlier turn.');
    const state = replay(log);
    const checked = checkProposal(state, policy);
    if (!checked.ok) throw Error(`Policy cannot advance: ${checked.reason}`);
    const next = {...log, actions:[...log.actions, policy]};
    return projected(next, advanceCouncil(state, policy));
  });

await server.connect(new StdioServerTransport());
