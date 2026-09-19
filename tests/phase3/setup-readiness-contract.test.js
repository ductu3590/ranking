'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeSetupReadiness } = require('../../lib/tournament/setupReadiness');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/060_unified_setup_readiness.sql');
const route = read('app/api/tournament-v2/setup/route.js');

assert.match(migration, /ADD COLUMN IF NOT EXISTS setup_revision bigint NOT NULL DEFAULT 1/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS roster_lock_status text NOT NULL DEFAULT 'open'/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_tournament_division_readiness\(/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /WHERE id = p_division_id\s+AND group_id = p_group_id\s+AND tournament_id = p_tournament_id/s);
assert.match(migration, /PAIR_MEMBER_COUNT_INVALID/);
assert.match(migration, /PAIR_ENTRY_LINK_MISSING/);
assert.match(migration, /legacy_compatible/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_tournament_division_readiness/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_tournament_division_readiness[\s\S]*TO service_role/);

assert.match(route, /requireValidatedGroupAdmin/);
assert.match(route, /get_tournament_division_readiness/);
assert.match(route, /p_group_id: Number\(groupId\)/);
assert.match(route, /p_tournament_id: Number\(tournamentId\)/);
assert.match(route, /p_division_id: Number\(divisionId\)/);
assert.match(route, /normalizeSetupReadiness/);

assert.deepEqual(normalizeSetupReadiness({
  status: 'ready', revision: '2', reasons: null, counts: null,
}), { status: 'ready', revision: 2, reasons: [], counts: {} });
assert.throws(() => normalizeSetupReadiness({ status: 'unknown', revision: 1 }), /INVALID_SETUP_READINESS/);
assert.throws(() => normalizeSetupReadiness({ status: 'ready', revision: 0 }), /INVALID_SETUP_READINESS/);

console.log('setup readiness contract ok');
