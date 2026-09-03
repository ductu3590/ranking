'use strict';

const assert = require('node:assert/strict');
const {
  hashSessionKey,
  toRosterProjection,
  toPublicCandidate,
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

console.log('identity compatibility repository tests ok');
