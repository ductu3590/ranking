const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/062_division_entry_stage_advance.sql');

assert.match(migration, /FUNCTION public\.advance_division_entry_stage/, 'creates a distinct entry advance RPC');
assert.match(migration, /FOR UPDATE/, 'locks stages and idempotency records');
assert.match(migration, /next_stage\.tournament_id IS DISTINCT FROM current_stage\.tournament_id/, 'rejects cross-tournament next stage');
assert.match(migration, /next_stage\.division_id IS DISTINCT FROM current_stage\.division_id/, 'rejects cross-division next stage with null-safe comparison');
assert.match(migration, /next stage already has seeded results/, 'does not overwrite existing next-stage seeds');
assert.match(migration, /entry\.division_id = current_stage\.division_id/, 'validates each seed against current division');
assert.match(migration, /division_id, entry_id, entrant_id, seed_in_stage/, 'inserts entry-based stage seed rows');
assert.match(migration, /NULLIF\(item->>'seed_in_stage'/, 'persists seeded order');
assert.match(migration, /payload_fingerprint/, 'binds idempotency replay to its payload');
assert.match(migration, /IDEMPOTENCY_KEY_REUSED/, 'rejects idempotency key reuse with another transition');
assert.doesNotMatch(migration, /DELETE FROM public\.tournament_stage_entrants/, 'never replaces next-stage results');

console.log('division entry advance RPC contract ok');