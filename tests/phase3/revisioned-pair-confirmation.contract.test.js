const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/061_harden_revisioned_pair_confirmation.sql');
const readiness = read('database/migrations/060_unified_setup_readiness.sql');
const route = read('app/api/tournament-v2/pairings/route.js');

assert.match(migration, /REFERENCES public\.tournament_pairs\(id\) ON DELETE RESTRICT/, 'forward FK hardening prevents pair-backed entries from orphaning');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.tournament_setup_mutations/, 'revisioned idempotency is isolated from legacy mutation storage');
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.confirm_tournament_pairs_revisioned\(/, 'new RPC has a distinct compatibility-safe name');
assert.match(migration, /p_expected_setup_revision bigint/, 'new RPC accepts expected setup revision');
assert.match(migration, /FOR UPDATE[\s\S]*d\.setup_revision <> p_expected_setup_revision/, 'division lock and revision CAS occur in the same RPC');
assert.match(migration, /d\.roster_lock_status <> 'open'/, 'locked rosters reject pair confirmation');
assert.match(migration, /LEGACY_IDEMPOTENCY_RECORD_UNSAFE/, 'legacy unscoped idempotency records are rejected');
assert.match(migration, /cached\.division_id <> p_division_id OR cached\.payload_fingerprint <> payload_fingerprint/, 'replays bind both division scope and payload fingerprint');
assert.doesNotMatch(migration, /create_tournament_pairs_atomic\(/, 'revisioned RPC does not nest the legacy idempotency-owning RPC');
assert.match(migration, /SET setup_revision = setup_revision \+ 1/, 'revision increments only after pair and entry writes succeed');
assert.match(migration, /'setup_revision', d\.setup_revision/, 'response returns the new revision');
assert.match(route, /expected_setup_revision/, 'confirm route requires the setup revision');
assert.match(route, /confirm_tournament_pairs_revisioned/, 'confirm route calls the revision-aware RPC');
assert.match(route, /SETUP_REVISION_CONFLICT\|ROSTER_LOCKED/, 'route maps stale and locked outcomes to conflict responses');
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_tournament_division_readiness\(/, 'forward migration can replace the readiness projection safely');
assert.match(readiness, /APPROVED_DOUBLES_ENTRY_PAIR_ID_MISSING/, 'deployed readiness blocks approved doubles entries without pair identity');
assert.match(readiness, /PAIR_ENTRY_COUNT_MISMATCH/, 'deployed readiness blocks pair and approved-entry count mismatches');

console.log('revisioned pair confirmation contract ok');