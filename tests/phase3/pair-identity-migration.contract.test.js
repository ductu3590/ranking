const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/059_unified_setup_pair_identity.sql');
const route = read('app/api/tournament-v2/pairings/route.js');

assert.match(migration, /ADD COLUMN IF NOT EXISTS pair_id bigint/, 'entries retain stable pair_id');
assert.match(migration, /tournament_entries_pair_id_fk[\s\S]*REFERENCES public\.tournament_pairs\(id\) ON DELETE SET NULL/, 'migration 059 preserves existing entries before hardening');
assert.match(migration, /idx_tournament_entries_pair_identity[\s\S]*ON public\.tournament_entries\(pair_id\)/, 'one entry is linked to each stable pair');
assert.match(migration, /enforce_tournament_entry_pair_identity/, 'entry link tenant/division trigger exists');
assert.match(migration, /enforce_tournament_pair_member_identity/, 'pair-member ownership trigger exists');
assert.match(migration, /ATHLETE_ALREADY_PAIRED_IN_DIVISION/, 'athletes cannot occur in two pairs in one division');
assert.match(migration, /pg_advisory_xact_lock[\s\S]*pair-member/, 'cross-pair check is concurrency-safe');
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_tournament_pairs_atomic/, 'existing pair RPC signature is retained');
assert.match(migration, /pair_id, name_snapshot, status/, 'atomic RPC links each newly created entry to its pair');
assert.match(migration, /'pairs', created_pairs/, 'RPC returns explicit stable pair records');
assert.match(migration, /'pair_id', pair_row\.id, 'entry_id', entry_row\.id, 'member_ids', to_jsonb\(ids\)/, 'returned pairs include ids and members');
assert.match(migration, /IDEMPOTENCY_KEY_REUSED/, 'new replays reject changed request semantics');
assert.match(migration, /cached \? 'idempotency_context'/, 'migration 059 marks scoped idempotency context');
assert.match(migration, /SECURITY DEFINER SET search_path = public/, 'RPC preserves security-definer search path');
assert.match(migration, /REVOKE ALL ON FUNCTION public\.enforce_tournament_entry_pair_identity\(\) FROM PUBLIC, anon, authenticated/, 'trigger helper is not publicly executable');
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_tournament_pairs_atomic[\s\S]*TO service_role/, 'RPC remains service-role only');
assert.match(route, /function atomicPairingError/, 'route maps atomic RPC errors to stable HTTP responses');
assert.match(route, /IDEMPOTENCY_KEY_REUSED/, 'route exposes reused idempotency key as a stable conflict');
assert.match(route, /expected_setup_revision/, 'route requires a setup revision for pair confirmation');
assert.match(route, /confirm_tournament_pairs_revisioned/, 'route dispatches to the revision-aware pair RPC');

console.log('pair identity migration contract ok');
