'use strict';

// Hop dong "replace_participants": helper thuan JS + migration 074 + route.
// Chay truc tiep: node tests/phase3/unified-setup-participants.contract.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeParticipants,
  normalizeParticipant,
  normalizeClientRef,
  normalizeOptionalClientRef,
  buildReplaceParticipantsArgs,
  REPLACE_PARTICIPANTS_RPC,
  MAX_PARTICIPANTS,
} = require('../../lib/tournament/setupParticipants');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').split('\r\n').join('\n');
const migration = read('database/migrations/074_unified_setup_identity.sql');
const route = read('app/api/tournament-v2/setup/route.js');
const athletesRoute = read('app/api/tournament-v2/athletes/route.js');

const guest = (ref, name) => ({ client_ref: ref, display_name: name, source: 'guest' });
const rejects = (value, label) => assert.throws(
  () => normalizeParticipants(value),
  (error) => error.code === 'SETUP_PAYLOAD_INVALID',
  label,
);

/* ---------- 1. Chuan hoa payload ---------- */

const normalized = normalizeParticipants([
  { client_ref: '  a-1 ', display_name: '  Nam  ', source: 'guest' },
  { client_ref: 'a-2', display_name: 'Lan', athlete_id: '7', source: 'club_member', phr_rating: '3.5' },
  { client_ref: 'a-3', display_name: 'Khach' },
  { client_ref: 'a-4', display_name: 'Hoi vien', athlete_id: 9 },
]);
assert.deepEqual(normalized[0], { client_ref: 'a-1', display_name: 'Nam', athlete_id: null, source: 'guest', phr_rating: null });
assert.deepEqual(normalized[1], { client_ref: 'a-2', display_name: 'Lan', athlete_id: 7, source: 'club_member', phr_rating: 3.5 });
assert.equal(normalized[2].source, 'guest');
assert.equal(normalized[2].athlete_id, null);
assert.equal(normalized[3].source, 'club_member');
assert.equal(normalized[3].athlete_id, 9);

assert.equal(MAX_PARTICIPANTS, 128);
assert.equal(normalizeClientRef(' x '), 'x');
assert.equal(normalizeOptionalClientRef(null), null);
assert.equal(normalizeOptionalClientRef(''), null);
assert.equal(normalizeOptionalClientRef(' k '), 'k');
assert.throws(() => normalizeOptionalClientRef(5), /client_ref/);

/* ---------- 2. Cac truong hop phai tu choi ---------- */

rejects(null, 'participants phai la mang');
rejects({}, 'object khong phai mang');
rejects([], 'mang rong bi tu choi');
rejects(Array.from({ length: 129 }, (_, i) => guest('r' + i, 'VDV ' + i)), 'qua 128 VDV bi tu choi');
rejects([guest('a', 'Nam'), guest('a', 'Lan')], 'client_ref trung bi tu choi');
rejects([guest('', 'Nam')], 'client_ref rong bi tu choi');
rejects([guest('x'.repeat(201), 'Nam')], 'client_ref qua dai bi tu choi');
rejects([{ client_ref: 'a', display_name: '   ', source: 'guest' }], 'display_name rong bi tu choi');
rejects([{ client_ref: 'a', display_name: 'Nam', source: 'organiser' }], 'source la bi tu choi');
rejects([{ client_ref: 'a', display_name: 'Nam', source: 'club_member' }], 'club_member thieu athlete_id bi tu choi');
rejects([{ client_ref: 'a', display_name: 'Nam', source: 'guest', athlete_id: 3 }], 'guest kem athlete_id bi tu choi');
rejects([{ client_ref: 'a', display_name: 'Nam', athlete_id: 0 }], 'athlete_id 0 bi tu choi');
rejects([{ client_ref: 'a', display_name: 'Nam', athlete_id: -2 }], 'athlete_id am bi tu choi');
rejects([{ client_ref: 'a', display_name: 'Nam', athlete_id: 1.5 }], 'athlete_id khong nguyen bi tu choi');
rejects([{ client_ref: 'a', display_name: 'Nam', athlete_id: 'abc' }], 'athlete_id khong phai so bi tu choi');
rejects([{ client_ref: 'a', display_name: 'Nam', source: 'guest', phr_rating: -1 }], 'phr_rating am bi tu choi');
rejects([{ client_ref: 'a', display_name: 'Nam', source: 'guest', group_id: 1 }], 'truong ngoai allowlist bi tu choi');
rejects([
  { client_ref: 'a', display_name: 'Nam', athlete_id: 4 },
  { client_ref: 'b', display_name: 'Nam khac', athlete_id: 4 },
], 'hai client_ref tro ve cung athlete_id bi tu choi');
assert.throws(() => normalizeParticipant('Nam'), /object/);
assert.equal(normalizeParticipants([guest('a', 'Nam'), guest('b', 'Nam')]).length, 2);

/* ---------- 3. Ten RPC va ten tham so route gui di ---------- */

const args = buildReplaceParticipantsArgs({
  groupId: 1, tournamentId: 47, divisionId: 35, tournamentClubId: 11,
  participants: [guest('a', 'Nam'), guest('b', 'Lan')],
  expectedSetupRevision: 1, idempotencyKey: 'key-1',
});
assert.deepEqual(Object.keys(args).sort(), [
  'p_division_id', 'p_expected_setup_revision', 'p_group_id', 'p_idempotency_key',
  'p_participants', 'p_tournament_club_id', 'p_tournament_id',
]);
assert.equal(args.p_group_id, 1);
assert.equal(args.p_participants.length, 2);
assert.equal(REPLACE_PARTICIPANTS_RPC, 'replace_division_participants_revisioned');
assert.ok(route.includes("db.rpc('" + REPLACE_PARTICIPANTS_RPC + "'"), 'route goi dung ten RPC');
for (const key of Object.keys(args)) {
  assert.ok(new RegExp(key + ':').test(route), 'route gui tham so ' + key);
  assert.ok(migration.includes(String.fromCharCode(10) + '  ' + key + ' '), 'migration khai bao ' + key);
}
assert.ok(migration.includes('FUNCTION public.' + REPLACE_PARTICIPANTS_RPC + '('), '074 dinh nghia RPC');

/* ---------- 4. Bang anh xa loi -> HTTP trong route ---------- */

const parseList = (label, block) => {
  assert.ok(block, 'route phai khai bao ' + label);
  return (block[1].match(/'[A-Z_]+'/g) || []).map((token) => token.slice(1, -1));
};
const named = parseList('NAMED_MUTATION_CODES', /const NAMED_MUTATION_CODES = \[([\s\S]*?)\];/.exec(route));
const conflicts = parseList('CONFLICT_MUTATION_CODES', /const CONFLICT_MUTATION_CODES = \[([\s\S]*?)\];/.exec(route));
const CONTRACT_409 = [
  'SETUP_REVISION_CONFLICT', 'ROSTER_LOCKED', 'IDEMPOTENCY_KEY_REUSED',
  'ROSTER_MEMBER_IN_ACTIVE_PAIR', 'REPAIR_BLOCKED_FIXTURES_EXIST', 'REPAIR_BLOCKED_ATHLETE_REUSE',
];
const CONTRACT_400 = ['REPAIR_ENTRY_MEMBER_COUNT_INVALID', 'SETUP_PAYLOAD_INVALID'];
for (const code of CONTRACT_409) {
  assert.ok(named.includes(code), code + ' phai duoc nhan dang');
  assert.ok(conflicts.includes(code), code + ' phai tra 409');
}
for (const code of CONTRACT_400) {
  assert.ok(named.includes(code), code + ' phai duoc nhan dang');
  assert.ok(!conflicts.includes(code), code + ' khong duoc tra 409');
}
assert.match(route, /pgCode === 'P0002'\n\s*\? 404/);
assert.match(route, /pgCode === 'P0002' \? 'DIVISION_NOT_FOUND' : null/);
assert.match(route, /pgCode === '23503' \? 'SETUP_SCOPE_MISMATCH' : null/);
// Xung dot nghiep vu doi sang SQLSTATE 'PH409' (migration 078): 40001 la
// serialization_failure nen bi tang tren tu dong retry va request treo ~120s thay
// vi tra 409. Route phai coi CA HAI ma la xung dot -> 409, va '23503' van la
// sai pham vi -> 409.
assert.match(route, /CONFLICT_CODES = \['PH409', '40001'\]/);
assert.match(route, /\[\.\.\.CONFLICT_CODES, '23503'\]\.includes\(pgCode\)/);
assert.match(route, /\['22023'\]\.includes\(pgCode\) \? 400 : 400/);

/* ---------- 5. Route: nhanh action va rang buoc payload ---------- */

assert.match(route, /action === 'replace_participants'/);
assert.match(route, /rawParticipants\.length > 128/);
assert.match(route, /uniqueClientRefs\.size !== rawParticipants\.length/);
assert.match(route, /normalizeParticipants\(rawParticipants\)/);
assert.match(route, /p_group_id: Number\(groupId\)/);
assert.ok(!/body\?\.group_id|body\.group_id/.test(route), 'group_id khong bao gio lay tu body');
for (const action of ['replace_roster', 'lock_roster', 'unlock_roster', 'configure_top_two_playoff']) {
  assert.ok(route.includes("'" + action + "'"), 'giu nguyen action ' + action);
}

/* ---------- 6. Migration 074 ---------- */

assert.match(migration, /^BEGIN;$/m);
assert.match(migration, /^COMMIT;$/m);
assert.match(migration, /ALTER TABLE public\.tournament_athletes\n  ADD COLUMN IF NOT EXISTS client_ref text;/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_athletes_client_ref\n  ON public\.tournament_athletes\(group_id, tournament_id, client_ref\)\n  WHERE client_ref IS NOT NULL;/);
assert.match(migration, /ALTER TABLE public\.tournaments\n  ADD COLUMN IF NOT EXISTS client_draft_key text;/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_client_draft_key\n  ON public\.tournaments\(group_id, client_draft_key\)\n  WHERE client_draft_key IS NOT NULL;/);
assert.match(migration, /SECURITY DEFINER SET search_path = public/);
for (const code of ['SETUP_REVISION_CONFLICT', 'ROSTER_LOCKED', 'IDEMPOTENCY_KEY_REUSED', 'ROSTER_MEMBER_IN_ACTIVE_PAIR', 'SETUP_SCOPE_MISMATCH', 'SETUP_PAYLOAD_INVALID']) {
  assert.ok(migration.includes(code), '074 raise ' + code);
}
assert.equal((migration.match(/setup_revision = setup_revision \+ 1/g) || []).length, 1);
assert.match(migration, /WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id\n  FOR UPDATE;/);
assert.match(migration, /d\.setup_revision <> p_expected_setup_revision/);
assert.match(migration, /d\.roster_lock_status <> 'open'/);
for (const key of ["'success', true", "'setup_revision'", "'athletes', athletes_report", "'roster_count'", "'client_ref', v_client_ref", "'tournament_athlete_id', v_row_id", "'created', v_created"]) {
  assert.ok(migration.includes(key), '074 tra ve ' + key);
}
assert.match(migration, /REVOKE ALL ON FUNCTION public\.replace_division_participants_revisioned\(bigint,bigint,bigint,bigint,jsonb,bigint,text\)\n  FROM PUBLIC, anon, authenticated;/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.replace_division_participants_revisioned\(bigint,bigint,bigint,bigint,jsonb,bigint,text\)\n  TO service_role;/);
const sqlBody = migration.replace(/--.*/g, ' ');
assert.ok(!/\bDROP\b/i.test(sqlBody), '074 khong co DROP');
assert.ok(!/\bTRUNCATE\b/i.test(sqlBody), '074 khong co TRUNCATE');
const deletes = sqlBody.match(/DELETE FROM[\s\S]*?;/g) || [];
assert.equal(deletes.length, 1);
assert.match(deletes[0], /WHERE group_id = p_group_id\n    AND division_id = p_division_id/);
assert.ok(
  sqlBody.indexOf('INSERT INTO public.tournament_athletes(') < sqlBody.indexOf('INSERT INTO public.tournament_division_roster_members('),
  '074 ghi tournament_athletes truoc roster',
);

/* ---------- 7. Route athletes: tao lai khong sinh ban trung ---------- */

assert.match(athletesRoute, /normalizeOptionalClientRef/);
assert.match(athletesRoute, /\.eq\('client_ref', clientRef\)/);
assert.match(athletesRoute, /reused: true/);
assert.match(athletesRoute, /if \(clientRef\) insertPayload\.client_ref = clientRef;/);
assert.match(athletesRoute, /duplicate \? 409 : 500/);
assert.match(athletesRoute, /buildGuestAthletePayload/);

console.log('unified setup participants contract ok');
