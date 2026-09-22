'use strict';

const { assert, read, expectModule } = require('../_harness');

const route = read('app/api/tournament-v2/preview-schedule/route.js');
const buildPlan = expectModule('lib/tournament/internalDoublesGroupKnockoutPlan.js', 'buildInternalDoublesGroupKnockoutPlan');

assert.ok(route.includes('requireValidatedGroupAdmin'), 'preview requires a validated admin session');
assert.ok(route.includes("from('tournament_divisions')") && route.includes('setup_draft') && route.includes("from('tournaments')"), 'preview reads the tenant-scoped persisted aggregate and parent tournament');
assert.ok(route.includes(".eq('group_id', Number(admin.groupId))"), 'both preview reads scope the group from the server session');
assert.ok(route.includes('expectedRevision') && route.includes('DRAFT_FINGERPRINT_MISMATCH'), 'preview rejects stale revisions and draft snapshots');
assert.ok(route.includes('UNSUPPORTED_ORGANIZER_MODE') && route.includes('UNSUPPORTED_PREVIEW_FORMAT'), 'preview explicitly limits the slice to internal doubles group-knockout');
assert.ok(route.includes('PAIR_ID_REQUIRED') && route.includes('UNPAIRED_MEMBER') && route.includes('UNPAIRED_MEMBER_OUTSIDE_ACTIVE_ROSTER') && route.includes('RESERVE_MEMBER_OUTSIDE_ROSTER'), 'preview validates stable pairs, active members, and reserves');
assert.ok(route.includes("from('club_members')") && route.includes("from('athletes')") && route.includes('MEMBER_NOT_ACTIVE_IN_GROUP') && route.includes('ATHLETE_IDENTITY_MISSING'), 'preview resolves saved member identities within the server tenant');
assert.ok(route.includes('entryId: pairId'), 'pairId is the transient, client-stable preview entrant identity');
assert.ok(route.includes('draftUpdate:') && route.includes("status: 'draft'"), 'preview returns a non-persisted aggregate draw update');
assert.ok(route.includes('previewFingerprint: plan.fingerprint'), 'preview persists the canonical plan fingerprint for finalization');
assert.ok(route.includes("error: error.message") && route.includes("code: error.code"), 'preview errors use the shared top-level client error envelope');
assert.ok(!route.includes('.insert(') && !route.includes('.upsert(') && !route.includes('.rpc(') && !route.includes(".from('tournament_divisions').update("), 'preview does not write database state');
assert.ok(!route.includes('buildSchedulePreview') && !route.includes('entrant_count'), 'legacy count-based synthetic preview is not used');

const plan = buildPlan({
    tournamentId: '101', divisionId: '201', seed: 'saved-draw-seed',
    entries: [{ entryId: 'pair-a' }, { entryId: 'pair-b' }, { entryId: 'pair-c' }, { entryId: 'pair-d' }],
});
assert.ok(plan.groups.flatMap((group) => group.entryIds).every((entryId) => entryId.startsWith('pair-')), 'canonical plan preserves supplied pair IDs as entry IDs');

console.log('unified setup preview schedule API contract ok');