'use strict';

const {
  scoreDuplicateCandidate,
  shouldQueueDuplicateReview,
} = require('../../domain/identity/duplicates');
const { authorizeClubSession } = require('./authorization');
const { identityError } = require('./errors');

function toDomainAthlete(row) {
  return {
    id: row.id,
    displayName: row.display_name ?? row.displayName,
    aliases: row.aliases || [],
    birthYear: row.birth_year ?? row.birthYear,
    hometown: row.hometown,
    clubIds: row.club_ids ?? row.clubIds ?? [],
  };
}

function createSearchPotentialDuplicateAthletes({ repository, now = Date.now, threshold = 50 }) {
  return async function searchPotentialDuplicateAthletes(input = {}) {
    const club = await authorizeClubSession({
      repository,
      session: input.session,
      action: 'manage',
      groupId: input.session?.group_id,
      now: now(),
    });
    const athlete = await repository.findAthleteById(input.athleteId);
    if (!athlete) throw identityError('NOT_FOUND', 'Athlete was not found');
    const left = toDomainAthlete(athlete);
    if (!left.clubIds.some((id) => String(id) === String(club.id))) {
      throw identityError('CLUB_SCOPE_MISMATCH', 'Athlete is outside this club');
    }
    const candidates = await repository.searchDuplicateCandidates(left, club.id);
    return candidates
      .filter((candidate) => String(candidate.id) !== String(athlete.id))
      .map((candidate) => ({ candidate, result: scoreDuplicateCandidate(left, toDomainAthlete(candidate)) }))
      .filter(({ result }) => shouldQueueDuplicateReview(result, threshold))
      .sort((a, b) => b.result.score - a.result.score)
      .map(({ candidate, result }) => ({
        athleteId: candidate.id,
        displayName: candidate.display_name ?? candidate.displayName,
        clubIds: candidate.club_ids ?? candidate.clubIds ?? [],
        score: result.score,
        reasons: result.reasons,
        autoMerge: false,
      }));
  };
}

function createReviewAthleteLink({ repository, now = Date.now }) {
  return async function reviewAthleteLink(input = {}) {
    const timestamp = now();
    const club = await authorizeClubSession({
      repository,
      session: input.session,
      action: 'manage',
      groupId: input.session?.group_id,
      now: timestamp,
    });
    if (
      !input.athleteId ||
      !input.candidateAthleteId ||
      String(input.athleteId) === String(input.candidateAthleteId)
    ) {
      throw identityError('INVALID_INPUT', 'Two distinct athlete IDs are required');
    }
    if (!['approve', 'reject'].includes(input.decision)) {
      throw identityError('INVALID_INPUT', 'Review decision is invalid');
    }
    const reason = String(input.reason ?? '').trim();
    if (!reason) throw identityError('INVALID_INPUT', 'A review reason is required');
    const [athlete, candidate] = await Promise.all([
      repository.findAthleteById(input.athleteId),
      repository.findAthleteById(input.candidateAthleteId),
    ]);
    if (!athlete || !candidate) throw identityError('NOT_FOUND', 'Review athlete was not found');
    const clubIds = toDomainAthlete(athlete).clubIds;
    if (!clubIds.some((id) => String(id) === String(club.id))) {
      throw identityError('CLUB_SCOPE_MISMATCH', 'Athlete is outside this club');
    }
    return repository.recordAthleteLinkReview({
      clubId: club.id,
      athleteId: input.athleteId,
      candidateAthleteId: input.candidateAthleteId,
      decision: input.decision,
      reason,
      actorType: 'club_admin_session',
      correlationId: input.correlationId || null,
      reviewedAt: timestamp,
    });
  };
}

module.exports = {
  createSearchPotentialDuplicateAthletes,
  createReviewAthleteLink,
};
