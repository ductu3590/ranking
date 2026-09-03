'use strict';

const { validateMembershipPeriod } = require('../../domain/identity/membership');
const { authorizeClubSession } = require('./authorization');
const { identityError } = require('./errors');

function dateOnly(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function cleanRequired(value, field) {
  const cleaned = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!cleaned) throw identityError('INVALID_INPUT', `${field} is required`);
  return cleaned;
}

function requireVersion(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw identityError('INVALID_INPUT', 'A positive expectedVersion is required');
  }
  return value;
}

function createCreateUnclaimedAthlete({ repository, now = Date.now }) {
  return async function createUnclaimedAthlete(input = {}) {
    const timestamp = now();
    const club = await authorizeClubSession({
      repository,
      session: input.session,
      action: 'create',
      groupId: input.session?.group_id,
      now: timestamp,
    });
    const displayName = cleanRequired(input.displayName, 'displayName');
    const alias = input.alias == null ? displayName : cleanRequired(input.alias, 'alias');
    const effectiveFrom = input.effectiveFrom || dateOnly(timestamp);
    const period = validateMembershipPeriod({ effective_from: effectiveFrom, effective_to: null });
    if (!period.valid) throw identityError('INVALID_INPUT', period.reason);

    return repository.createCompatibilityRosterEntry({
      clubId: club.id,
      displayName,
      alias,
      effectiveFrom,
      actorType: 'club_admin_session',
      correlationId: input.correlationId || null,
    });
  };
}

function createUpdateMembershipAlias({ repository, now = Date.now }) {
  return async function updateMembershipAlias(input = {}) {
    const timestamp = now();
    const club = await authorizeClubSession({
      repository,
      session: input.session,
      action: 'update',
      groupId: input.session?.group_id,
      now: timestamp,
    });
    const membershipId = input.membershipId;
    if (!membershipId) throw identityError('INVALID_INPUT', 'membershipId is required');
    const result = await repository.updateMembershipAlias({
      clubId: club.id,
      membershipId,
      alias: cleanRequired(input.alias, 'alias'),
      expectedVersion: requireVersion(input.expectedVersion),
      actorType: 'club_admin_session',
      correlationId: input.correlationId || null,
    });
    if (!result) throw identityError('VERSION_CONFLICT', 'Membership version changed');
    return result;
  };
}

function createEndClubMembership({ repository, now = Date.now }) {
  return async function endClubMembership(input = {}) {
    const timestamp = now();
    const club = await authorizeClubSession({
      repository,
      session: input.session,
      action: 'update',
      groupId: input.session?.group_id,
      now: timestamp,
    });
    const membershipId = input.membershipId;
    if (!membershipId) throw identityError('INVALID_INPUT', 'membershipId is required');
    const effectiveTo = input.effectiveTo || dateOnly(timestamp);
    const membership = await repository.findMembershipById?.(membershipId, club.id);
    if (membership) {
      const period = validateMembershipPeriod({
        effective_from: membership.effective_from,
        effective_to: effectiveTo,
      });
      if (!period.valid) throw identityError('INVALID_INPUT', period.reason);
    }
    const result = await repository.endMembership({
      clubId: club.id,
      membershipId,
      effectiveTo,
      expectedVersion: requireVersion(input.expectedVersion),
      actorType: 'club_admin_session',
      correlationId: input.correlationId || null,
    });
    if (!result) throw identityError('VERSION_CONFLICT', 'Membership version changed');
    return result;
  };
}

module.exports = {
  createCreateUnclaimedAthlete,
  createUpdateMembershipAlias,
  createEndClubMembership,
};
