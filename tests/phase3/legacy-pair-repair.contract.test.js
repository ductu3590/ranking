'use strict';

// Hop dong "repair_legacy_pairs": helper thuan JS + migration 075 + route.
// Chay truc tiep: node tests/phase3/legacy-pair-repair.contract.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  legacyClientRef,
  resolveRepairMode,
  buildRepairArgs,
  normalizeRepairReport,
  REPAIR_LEGACY_PAIRS_RPC,
  LEGACY_CLIENT_REF_PREFIX,
} = require('../../lib/tournament/legacyPairRepair');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').split('\r\n').join('\n');
const migration = read('database/migrations/075_legacy_division_pair_repair.sql');
const route = read('app/api/tournament-v2/setup/route.js');
const sql = migration.replace(/--.*/g, ' ');

/* ---------- 1. client_ref khoa theo entry_member id, khong theo ten ---------- */

assert.equal(LEGACY_CLIENT_REF_PREFIX, 'legacy:entry_member:');
assert.equal(legacyClientRef(41), 'legacy:entry_member:41');
assert.equal(legacyClientRef('41'), 'legacy:entry_member:41');
assert.notEqual(legacyClientRef(41), legacyClientRef(42));
for (const bad of [0, -1, 1.5, null, undefined, 'abc', {}]) {
  assert.throws(() => legacyClientRef(bad), (error) => error.code === 'SETUP_PAYLOAD_INVALID');
}

/* ---------- 2. Mac dinh chay thu + rao chan confirm_apply ---------- */

assert.deepEqual(resolveRepairMode({}), { dryRun: true, confirmApply: false });
assert.deepEqual(resolveRepairMode({ dry_run: true }), { dryRun: true, confirmApply: false });
assert.deepEqual(resolveRepairMode({ dry_run: undefined }), { dryRun: true, confirmApply: false });
assert.deepEqual(resolveRepairMode({ dry_run: false, confirm_apply: true }), { dryRun: false, confirmApply: true });
assert.deepEqual(resolveRepairMode({ dryRun: false, confirmApply: true }), { dryRun: false, confirmApply: true });
for (const body of [
  { dry_run: false },
  { dry_run: false, confirm_apply: false },
  { dry_run: false, confirm_apply: 'true' },
  { dry_run: false, confirm_apply: 1 },
]) {
  assert.throws(
    () => resolveRepairMode(body),
    (error) => error.code === 'REPAIR_CONFIRMATION_REQUIRED',
    'ap dung that bat buoc confirm_apply === true',
  );
}
for (const body of [{ dry_run: 'false' }, { dry_run: 0 }, { dry_run: 1 }]) {
  assert.throws(() => resolveRepairMode(body), (error) => error.code === 'SETUP_PAYLOAD_INVALID');
}

/* ---------- 3. Ten RPC + ten tham so route gui di ---------- */

const args = buildRepairArgs({
  groupId: 1, tournamentId: 47, divisionId: 35,
  dryRun: true, expectedSetupRevision: 1, idempotencyKey: 'repair-1',
});
assert.deepEqual(Object.keys(args).sort(), [
  'p_division_id', 'p_dry_run', 'p_expected_setup_revision',
  'p_group_id', 'p_idempotency_key', 'p_tournament_id',
]);
assert.equal(args.p_dry_run, true);
assert.throws(() => buildRepairArgs({ groupId: 1, tournamentId: 1, divisionId: 1, dryRun: 'no', expectedSetupRevision: 1, idempotencyKey: 'k' }), (error) => error.code === 'SETUP_PAYLOAD_INVALID');
assert.equal(REPAIR_LEGACY_PAIRS_RPC, 'repair_legacy_division_pair_identity');
assert.ok(route.includes("db.rpc('" + REPAIR_LEGACY_PAIRS_RPC + "'"), 'route goi dung ten RPC');
for (const key of Object.keys(args)) {
  assert.ok(route.includes(key + ':'), 'route gui tham so ' + key);
  assert.ok(migration.includes(String.fromCharCode(10) + '  ' + key + ' '), 'migration khai bao ' + key);
}

/* ---------- 4. Bao cao tra ve phai dung hinh dang ---------- */

const dryReport = normalizeRepairReport({
  dry_run: true,
  entries: [{ entry_id: 26, name_snapshot_present: true, members: [], planned: 'create_pair' }],
  planned: { athletes: 16, roster: 16, pairs: 8, pair_members: 16, entries_updated: 8 },
  ambiguities: [], blockers: [],
  summary: { entries_to_repair: 8 },
});
assert.equal(dryReport.dry_run, true);
assert.deepEqual(dryReport.planned, { athletes: 16, roster: 16, pairs: 8, pair_members: 16, entries_updated: 8 });
assert.equal(dryReport.applied, undefined, 'chay thu khong co so lieu da ap dung');
assert.deepEqual(dryReport.summary, { entries_to_repair: 8 });

const appliedReport = normalizeRepairReport({
  dry_run: false,
  entries: [{ entry_id: 26, planned: 'create_pair', pair_id: 9 }, { entry_id: 27, planned: 'already_paired' }],
  planned: { athletes: 2, roster: 2, pairs: 1, pair_members: 2, entries_updated: 1 },
  applied: { athletes: 2, roster: 2, pairs: 1, pair_members: 2, entries_updated: 1 },
  setup_revision: 2, ambiguities: [], blockers: [],
});
assert.equal(appliedReport.dry_run, false);
assert.equal(appliedReport.setup_revision, 2);
assert.deepEqual(appliedReport.applied, { athletes: 2, roster: 2, pairs: 1, pair_members: 2, entries_updated: 1 });

const invalidReports = [
  null,
  [],
  { entries: [], planned: {} },
  { dry_run: 'true', entries: [], planned: {} },
  { dry_run: true, entries: [{ entry_id: 1, planned: 'invent_entry' }], planned: {} },
  { dry_run: true, entries: [], planned: { athletes: -1 } },
  { dry_run: false, entries: [], planned: {}, applied: {} },
  { dry_run: false, entries: [], planned: {}, applied: {}, setup_revision: 0 },
];
for (const report of invalidReports) {
  assert.throws(() => normalizeRepairReport(report), (error) => error.code === 'INVALID_REPAIR_REPORT');
}

/* ---------- 5. Route: nhanh action, mac dinh dry_run, rao confirm ---------- */

assert.match(route, /action === 'repair_legacy_pairs'/);
assert.match(route, /const dryRun = \(body\?\.dry_run \?\? body\?\.dryRun\) !== false;/);
assert.match(route, /const confirmApply = \(body\?\.confirm_apply \?\? body\?\.confirmApply\) === true;/);
assert.match(route, /code: 'REPAIR_CONFIRMATION_REQUIRED' \}, \{ status: 400 \}/);
assert.match(route, /p_dry_run: dryRun/);
assert.match(route, /normalizeRepairReport\(data\)/);

/* ---------- 6. Migration 075: khong bao gio sinh entry moi ---------- */

assert.ok(!/INSERT\s+INTO\s+public\.tournament_entries/i.test(sql), '075 khong INSERT entry moi');
assert.ok(!/INSERT\s+INTO\s+public\.tournament_entry_members/i.test(sql), '075 khong INSERT entry member moi');
assert.ok(!/DELETE\s+FROM/i.test(sql), '075 khong xoa bat cu dong nao');
assert.ok(!/\bDROP\b/i.test(sql), '075 khong co DROP');
assert.ok(!/\bTRUNCATE\b/i.test(sql), '075 khong co TRUNCATE');
assert.ok(!/INSERT\s+INTO\s+public\.athletes\b/i.test(sql), '075 khong tao danh tinh toan cuc gia');
assert.ok(!/\bILIKE\b/i.test(sql), '075 khong doi khop ten mo');
assert.ok(!/lower\s*\(\s*[a-z_.]*display_name/i.test(sql), '075 khong khop ten theo chu thuong');
assert.ok(!/GROUP\s+BY[^;]{0,120}display_name/i.test(sql), '075 khong gop danh tinh theo ten');
assert.match(sql, /UPDATE public\.tournament_entries SET pair_id = v_pair_id/);
assert.match(sql, /AND division_id = p_division_id AND pair_id IS NULL;/);
assert.match(sql, /'legacy:entry_member:' \|\| m\.id/);
assert.match(sql, /CASE WHEN m\.athlete_id IS NULL THEN 'guest' ELSE 'club_member' END/);
assert.match(sql, /m\.display_name_snapshot,/);

/* ---------- 7. Migration 075: tu choi, CAS, thu tu ghi, grants ---------- */

for (const code of [
  'REPAIR_ENTRY_MEMBER_COUNT_INVALID', 'REPAIR_BLOCKED_FIXTURES_EXIST', 'REPAIR_BLOCKED_ATHLETE_REUSE',
  'REPAIR_ENTRY_MEMBER_NAME_MISSING', 'SETUP_REVISION_CONFLICT', 'ROSTER_LOCKED',
  'IDEMPOTENCY_KEY_REUSED', 'SETUP_SCOPE_MISMATCH',
]) {
  assert.ok(new RegExp("RAISE EXCEPTION '" + code + "'").test(sql), '075 RAISE ' + code);
}
assert.match(sql, /tournament_matches/);
assert.match(sql, /tournament_stage_transitions/);
assert.match(sql, /d\.setup_revision <> p_expected_setup_revision/);
assert.match(sql, /d\.roster_lock_status <> 'open'/);
assert.match(sql, /FOR UPDATE/);
assert.match(sql, /tournament_setup_mutations/);
// Chi tang revision khi that su co entry duoc sua: chay lai la no-op.
assert.match(sql, /IF NOT p_dry_run AND applied_entries > 0 THEN/);
assert.equal((sql.match(/setup_revision = setup_revision \+ 1/g) || []).length, 1);
// Chay thu khong duoc ghi bat cu thu gi.
for (const write of [
  'INSERT INTO public.tournament_athletes(',
  'INSERT INTO public.tournament_division_roster_members(',
  'INSERT INTO public.tournament_pairs(',
  'INSERT INTO public.tournament_pair_members(',
  'UPDATE public.tournament_entries SET pair_id',
  'INSERT INTO public.tournament_setup_mutations(',
]) {
  const at = sql.indexOf(write);
  assert.ok(at > 0, '075 phai co cau lenh ' + write);
  const guardAt = sql.lastIndexOf('NOT p_dry_run', at);
  assert.ok(guardAt > 0 && at - guardAt < 900, 'cau lenh ghi phai nam trong nhanh NOT p_dry_run: ' + write);
}
// Thu tu ghi bat buoc boi trigger 059/064.
const order = [
  'INSERT INTO public.tournament_athletes(',
  'INSERT INTO public.tournament_division_roster_members(',
  'INSERT INTO public.tournament_pairs(',
  'INSERT INTO public.tournament_pair_members(',
  'UPDATE public.tournament_entries SET pair_id',
];
for (let i = 1; i < order.length; i += 1) {
  assert.ok(sql.indexOf(order[i - 1]) < sql.indexOf(order[i]), 'thu tu ghi: ' + order[i - 1] + ' truoc ' + order[i]);
}
// Trigger 059 nem 23505 khi VDV da o cap khac: phai doi sang ma on dinh cua hop dong.
assert.match(sql, /EXCEPTION WHEN unique_violation THEN/);
// Hinh dang phan hoi.
for (const key of ["'dry_run', p_dry_run", "'entries', entries_report", "'planned'", "'ambiguities', ambiguities", "'blockers'", "'entries_updated'", "'applied'", "'setup_revision', d.setup_revision", "'summary', summary"]) {
  assert.ok(sql.includes(key), '075 tra ve ' + key);
}
for (const key of ["'entry_member_id', m.id", "'client_ref', v_client_ref", "'has_global_athlete_id'", "'name_snapshot_present'", "'create_pair'", "'already_paired'"]) {
  assert.ok(sql.includes(key), '075 bao cao ' + key);
}
// So lieu chay thu phai kiem chung duoc voi trang thai that cua giai 47.
for (const key of ['entries_to_repair', 'entry_member_rows', 'members_with_global_athlete_id', 'guest_identities', 'empty_display_names', 'entry_member_count_violations', 'blocking_matches', 'blocking_transitions', 'entry_club_ids']) {
  assert.ok(sql.includes("'" + key + "'"), '075 summary co ' + key);
}
assert.match(sql, /REVOKE ALL ON FUNCTION public\.repair_legacy_division_pair_identity\(bigint,bigint,bigint,boolean,bigint,text\)/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.repair_legacy_division_pair_identity\(bigint,bigint,bigint,boolean,bigint,text\)/);
assert.match(sql, /SECURITY DEFINER SET search_path = public/);
assert.match(migration, /^BEGIN;$/m);
assert.match(migration, /^COMMIT;$/m);

console.log('legacy pair repair contract ok');
