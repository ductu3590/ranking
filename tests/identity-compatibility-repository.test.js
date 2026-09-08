'use strict';

const assert = require('node:assert/strict');
const {
  createSupabaseIdentityRepository,
  hashSessionKey,
  toRosterProjection,
  toPublicCandidate,
  toAssessmentProjection,
} = require('../lib/repositories/identity/compatibilityRepository');

assert.equal(hashSessionKey('session-secret'), hashSessionKey('session-secret'));
assert.notEqual(hashSessionKey('session-secret'), 'session-secret');
assert.match(hashSessionKey('session-secret'), /^[a-f0-9]{64}$/);

assert.deepEqual(toRosterProjection({
  id: 41,
  club_id: 7,
  athlete_id: 31,
  status: 'active',
  effective_from: '2026-01-01',
  effective_to: null,
  club_alias: 'An',
  version: 2,
  private_notes: 'never expose',
  athlete: {
    id: 31,
    display_name: 'Nguyễn Văn An',
    status: 'unclaimed',
    legacy_club_member_id: 9,
  },
}), {
  id: 41,
  clubId: 7,
  athleteId: 31,
  status: 'active',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  alias: 'An',
  version: 2,
  athlete: {
    id: 31,
    displayName: 'Nguyễn Văn An',
    status: 'unclaimed',
  },
});

assert.deepEqual(toPublicCandidate({
  id: 31,
  display_name: 'Nguyễn Văn An',
  normalized_name: 'nguyễn văn an',
  status: 'unclaimed',
  private_notes: 'never expose',
  memberships: [
    { club_id: 7, club_alias: 'An', private_notes: 'hidden' },
    { club_id: 8, club_alias: null },
  ],
}), {
  id: 31,
  display_name: 'Nguyễn Văn An',
  normalized_name: 'nguyễn văn an',
  status: 'unclaimed',
  aliases: ['An'],
  club_ids: [7, 8],
});

assert.deepEqual(toAssessmentProjection({
  id: 81,
  club_id: 7,
  club_membership_id: 41,
  athlete_id: 31,
  assessed_at: '2026-09-03T08:00:00Z',
  effective_from: '2026-09-03',
  skill_level: '3.20',
  source: 'club_admin',
  notes: 'public assessment note',
  actor_type: 'club_admin_session',
  private_notes: 'never expose',
}), {
  id: 81,
  clubId: 7,
  membershipId: 41,
  athleteId: 31,
  assessedAt: '2026-09-03T08:00:00Z',
  effectiveFrom: '2026-09-03',
  skillLevel: 3.2,
  source: 'club_admin',
  notes: 'public assessment note',
  actorType: 'club_admin_session',
});

// club_members.aliases holds the bank-transfer matching keywords managed in /quy/admin.
// Roster writes may rename a member, but must never overwrite that list with a nickname.
function createFakeDb() {
  const writes = [];
  const rows = {
    club_members: { id: 9 },
    club_member_athlete_map: { athlete_id: 31, club_membership_id: 41, legacy_club_member_id: 9 },
    club_memberships: {
      id: 41, club_id: 7, athlete_id: 31, status: 'active',
      effective_from: '2026-01-01', effective_to: null, club_alias: 'An', version: 3,
    },
    athletes: { id: 31, display_name: 'NGUYỄN VĂN AN', status: 'unclaimed' },
  };
  const settled = (table) => Promise.resolve({ data: rows[table] ?? null, error: null });
  function from(table) {
    const api = {
      insert(payload) { writes.push({ table, op: 'insert', payload }); return api; },
      update(payload) { writes.push({ table, op: 'update', payload }); return api; },
      select() { return api; },
      eq() { return api; },
      order() { return api; },
      single() { return settled(table); },
      maybeSingle() { return settled(table); },
      then(resolve, reject) { return settled(table).then(resolve, reject); },
    };
    return api;
  }
  return { db: { from }, writes };
}

const legacyWrites = (writes) => writes.filter((write) => write.table === 'club_members');

(async () => {
  const created = createFakeDb();
  await createSupabaseIdentityRepository(created.db).createCompatibilityRosterEntry({
    clubId: 7, displayName: 'Nguyễn Văn An', alias: 'An', effectiveFrom: '2026-09-03',
  });
  for (const write of legacyWrites(created.writes)) {
    assert.ok(!('aliases' in write.payload), 'creating a roster entry must not seed bank aliases');
  }
  assert.equal(
    created.writes.find((write) => write.table === 'club_memberships' && write.op === 'update').payload.club_alias,
    'An',
    'the display nickname is stored on club_memberships.club_alias',
  );

  const renamed = createFakeDb();
  const renameResult = await createSupabaseIdentityRepository(renamed.db).updateMembershipProfile({
    clubId: 7, membershipId: 41, alias: 'An', displayName: 'Nguyễn Văn Ân', status: 'active', expectedVersion: 3,
  });
  assert.ok(renameResult, 'renaming returns the updated membership');
  assert.deepEqual(
    legacyWrites(renamed.writes).map((write) => write.payload),
    [{ full_name: 'NGUYỄN VĂN ÂN' }],
    'renaming touches only club_members.full_name',
  );
  const renamePatch = renamed.writes.find((write) => write.table === 'club_memberships' && write.op === 'update').payload;
  assert.equal(renamePatch.version, 5, 'rename accounts for the compatibility trigger version bump');
  assert.equal(renamePatch.status, 'active', 'rename restores the membership status the trigger rewrote');

  const aliasOnly = createFakeDb();
  await createSupabaseIdentityRepository(aliasOnly.db).updateMembershipProfile({
    clubId: 7, membershipId: 41, alias: 'An nhỏ', displayName: null, status: 'active', expectedVersion: 3,
  });
  assert.deepEqual(legacyWrites(aliasOnly.writes), [], 'a nickname-only edit never touches the legacy member row');
  const aliasPatch = aliasOnly.writes.find((write) => write.table === 'club_memberships' && write.op === 'update').payload;
  assert.equal(aliasPatch.version, 4, 'a nickname-only edit bumps the version exactly once');
  assert.equal(aliasPatch.club_alias, 'An nhỏ');

  console.log('identity compatibility repository tests ok');
})().catch((error) => { console.error(error); process.exit(1); });
