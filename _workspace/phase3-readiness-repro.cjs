// Read-only audit: execute current route handlers with synthetic DB/session adapters.
// This reproduces defects; it is NOT an acceptance test or a live DB rehearsal.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const domain = require('../lib/tournament/interclub');
const wizard = require('../lib/tournament/wizardModel');
const NextResponse = { json: (body, options = {}) => ({ status: options.status || 200, body }) };

function route(name, adapters) {
  const source = fs.readFileSync(path.join(root, 'app/api/tournament-v2', name, 'route.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export async function /g, 'async function ');
  const context = vm.createContext({ console, URL, NextResponse, ...domain, ...wizard,
    supabaseServer: null, ...adapters });
  vm.runInContext(source, context);
  return context;
}

function database(resolve) {
  return { from(table) {
    const query = { table, operation: 'read' };
    const chain = {};
    for (const method of ['eq', 'in', 'order']) chain[method] = () => chain;
    chain.select = (fields) => { query.fields = fields; return chain; };
    chain.insert = (values) => { query.operation = 'insert'; query.values = values; return chain; };
    chain.single = chain.maybeSingle = () => Promise.resolve(resolve(query));
    chain.then = (yes, no) => Promise.resolve(resolve(query)).then(yes, no);
    return chain;
  } };
}

(async () => {
  const privateRow = { id: 1, private_note: 'SYNTHETIC_PRIVATE_NOTE', captain_declaration: { private: true } };
  const registrations = route('registrations', {
    getClubScope: () => ({ ok: true, groupId: 99, role: 'member', session: { role: 'member' } }),
    supabaseAdmin: database(({ fields }) => ({ data: [Object.fromEntries(
      Object.entries(privateRow).filter(([key]) => fields.split(',').map(x => x.trim()).includes(key)))], error: null })),
  });
  const result = await registrations.GET({ url: 'http://audit.local/api?divisionId=1' });
  assert.equal(result.status, 200);
  assert.equal(result.body.registrations[0].private_note, 'SYNTHETIC_PRIVATE_NOTE');
  assert.equal(result.body.registrations[0].captain_declaration.private, true);
  console.log('CONFIRMED: member registrations GET returns private_note and captain_declaration.');

  let platformChecks = 0;
  const divisions = route('divisions', {
    supabaseAdmin: {},
    requireValidatedGroupAdmin: async () => ({ ok: false, response: NextResponse.json({ error: 'No group session' }, { status: 403 }) }),
    requirePlatformAdmin: async () => { platformChecks++; return { ok: true }; },
  });
  const community = await divisions.POST({ json: async () => ({ tournament_id: 1, name: 'Audit' }) });
  assert.equal(community.status, 403);
  assert.equal(platformChecks, 0);
  console.log('CONFIRMED: divisions POST rejects a platform-only session without consulting platform authorization.');

  const writes = [];
  const entries = route('entries', {
    requireValidatedGroupAdmin: async () => ({ ok: true, groupId: 99 }),
    supabaseAdmin: database(query => {
      if (query.table === 'tournament_divisions') return { data: { id: 1, tournament_id: 1, play_type: 'singles' }, error: null };
      if (query.table === 'tournament_entries') { writes.push(query.values); return { data: { id: 100 }, error: null }; }
      if (query.table === 'tournament_entry_members') return { data: null, error: { message: 'Injected member insert failure' } };
      throw new Error(`Unexpected query ${query.table}`);
    }),
  });
  const partial = await entries.POST({ json: async () => ({ division_id: 1, tournament_club_id: 2, name: 'Synthetic audit', members: [{ athlete_id: 3, display_name: 'Synthetic athlete' }] }) });
  assert.equal(partial.status, 500);
  assert.equal(writes.length, 1);
  console.log('CONFIRMED: entries POST writes the entry before member failure, with no rollback/atomic RPC.');
  console.log('No live database writes or real user data used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
