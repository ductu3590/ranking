'use strict';

const { authorizeClubSession } = require('./authorization');
const { identityError } = require('./errors');

const ALLOWED_SOURCES = new Set(['club_admin', 'correction']);

function createRecordMembershipAssessment({ repository, now = Date.now }) {
  return async function recordMembershipAssessment(input = {}) {
    const timestamp = now();
    const club = await authorizeClubSession({
      repository,
      session: input.session,
      action: 'create',
      groupId: input.session?.group_id,
      now: timestamp,
    });
    const skillLevel = Number(input.skillLevel);
    if (!Number.isFinite(skillLevel) || skillLevel < 1 || skillLevel > 5) {
      throw identityError('INVALID_INPUT', 'skillLevel must be between 1.0 and 5.0');
    }
    const source = input.source || 'club_admin';
    if (!ALLOWED_SOURCES.has(source)) throw identityError('INVALID_INPUT', 'Assessment source is invalid');
    const effectiveFrom = input.effectiveFrom || new Date(timestamp).toISOString().slice(0, 10);
    const effectiveTimestamp = Date.parse(`${effectiveFrom}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ||
      !Number.isFinite(effectiveTimestamp) ||
      new Date(effectiveTimestamp).toISOString().slice(0, 10) !== effectiveFrom
    ) {
      throw identityError('INVALID_INPUT', 'effectiveFrom must be a date');
    }
    const membership = await repository.findMembershipById(input.membershipId, club.id);
    if (!membership) throw identityError('NOT_FOUND', 'Membership was not found in this club');

    const row = await repository.createMembershipAssessment({
      clubId: club.id,
      membershipId: membership.id,
      athleteId: membership.athlete_id,
      skillLevel,
      effectiveFrom,
      source,
      notes: String(input.notes ?? '').trim() || null,
      actorType: 'club_admin_session',
      correlationId: input.correlationId || null,
    });
    return row;
  };
}

module.exports = { createRecordMembershipAssessment };
