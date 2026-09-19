'use strict';

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeRosterSelection(rows) {
  if (!Array.isArray(rows)) throw contractError('ROSTER_SELECTION_INVALID', 'Roster selection must be an array');
  return rows.map((row) => {
    if (!row || row.group_id != null) throw contractError('MEMBER_OUTSIDE_GROUP', 'Member is outside the current group');
    const memberId = Number(row.member_id);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) throw contractError('MEMBER_ID_INVALID', 'member_id is invalid');
    const athleteId = row.athlete_id == null || row.athlete_id === '' ? null : Number(row.athlete_id);
    if (!Number.isSafeInteger(athleteId) || athleteId <= 0) {
      throw contractError('ATHLETE_ID_MISSING', 'Selected member has no athlete_id');
    }
    return {
      memberId,
      athleteId,
      displayNameSnapshot: String(row.display_name ?? row.full_name ?? '').trim(),
    };
  });
}

function validatePairDraft(pairs) {
  if (!Array.isArray(pairs)) throw contractError('PAIR_DRAFT_INVALID', 'pairs must be an array');
  const seen = new Set();
  for (const pair of pairs) {
    if (!pair || !pair.pairId || !Array.isArray(pair.memberIds) || pair.memberIds.length !== 2) {
      throw contractError('PAIR_MEMBER_COUNT_INVALID', 'Each pair must contain two members');
    }
    for (const memberId of pair.memberIds) {
      const key = String(memberId);
      if (seen.has(key)) throw contractError('DUPLICATE_PAIR_MEMBER', 'A member cannot appear in two pairs');
      seen.add(key);
    }
  }
  return pairs;
}

function applyPairDraft(existingPairs, requestedPairs) {
  validatePairDraft(requestedPairs);
  const existing = new Map((existingPairs || []).map((pair) => [String(pair.pairId), pair]));
  const pairs = requestedPairs.map((pair) => {
    const prior = existing.get(String(pair.pairId));
    return {
      ...pair,
      pairId: String(pair.pairId),
      locked: prior?.locked === true || pair.locked === true,
    };
  });
  const paired = new Set(pairs.flatMap((pair) => pair.memberIds.map(String)));
  return { pairs, unpairedMemberIds: (requestedPairs.allMemberIds || []).filter((id) => !paired.has(String(id))) };
}

module.exports = { normalizeRosterSelection, validatePairDraft, applyPairDraft };
