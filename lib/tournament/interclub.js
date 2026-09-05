class InterclubError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InterclubError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new InterclubError(code, message);
}

function assertTournamentOrganizer(input = {}) {
  const type = input.organizer_type || 'platform';
  if (!['platform', 'community', 'club'].includes(type)) {
    fail('INVALID_ORGANIZER_TYPE', `Unknown organizer_type: ${type}`);
  }
  const hasClub = input.organizer_club_id != null;
  const hasCommunity = input.organizer_community_id != null;
  if (type === 'club' && !hasClub) fail('ORGANIZER_CLUB_REQUIRED', 'club organizer requires organizer_club_id');
  if (type !== 'club' && hasClub) fail('ORGANIZER_CLUB_FORBIDDEN', 'only club organizer may set organizer_club_id');
  if (type === 'community' && hasClub) fail('ORGANIZER_CLUB_FORBIDDEN', 'community organizer cannot set organizer_club_id');
  if (type !== 'community' && hasCommunity) fail('ORGANIZER_COMMUNITY_FORBIDDEN', 'only community organizer may set organizer_community_id');
  return { organizer_type: type, organizer_club_id: input.organizer_club_id ?? null, organizer_community_id: input.organizer_community_id ?? null };
}

const CLUB_TRANSITIONS = {
  invited: { accept: 'accepted', decline: 'declined', withdraw: 'withdrawn' },
  accepted: { submit_roster: 'roster_submitted', withdraw: 'withdrawn' },
  roster_submitted: { request_changes: 'changes_requested', approve: 'approved', withdraw: 'withdrawn' },
  changes_requested: { submit_roster: 'roster_submitted', withdraw: 'withdrawn' },
  approved: { request_changes: 'changes_requested', withdraw: 'withdrawn' },
  declined: { accept: 'accepted' },
  withdrawn: {},
};

function transitionTournamentClub(status, action) {
  const next = CLUB_TRANSITIONS[status]?.[action];
  if (!next) fail('INVALID_CLUB_TRANSITION', `${status} cannot ${action}`);
  return next;
}

const REGISTRATION_TRANSITIONS = {
  draft: { submit: 'submitted', withdraw: 'withdrawn' },
  submitted: { approve: 'approved', request_changes: 'changes_requested', reject: 'rejected', withdraw: 'withdrawn' },
  changes_requested: { resubmit: 'submitted', withdraw: 'withdrawn' },
  approved: { withdraw: 'withdrawn' },
  rejected: { resubmit: 'submitted' },
  withdrawn: {},
};

function transitionRegistration(status, action) {
  const next = REGISTRATION_TRANSITIONS[status]?.[action];
  if (!next) fail('INVALID_REGISTRATION_TRANSITION', `${status} cannot ${action}`);
  return next;
}

function validateRosterSubmission({ registrations = [], quota, eligibility = {} } = {}) {
  if (!Array.isArray(registrations)) fail('INVALID_ROSTER', 'registrations must be an array');
  if (quota != null && registrations.length > Number(quota)) fail('QUOTA_EXCEEDED', 'roster exceeds club quota');
  const seen = new Set();
  for (const registration of registrations) {
    if (registration.athlete_id != null) {
      if (seen.has(String(registration.athlete_id))) fail('DUPLICATE_ATHLETE', `athlete ${registration.athlete_id} appears more than once`);
      seen.add(String(registration.athlete_id));
    }
    const age = registration.age;
    const skill = registration.skill;
    if ((eligibility.minAge != null && (age == null || age < eligibility.minAge))
      || (eligibility.maxAge != null && (age == null || age > eligibility.maxAge))
      || (eligibility.gender && ![].concat(eligibility.gender).includes(registration.gender))
      || (eligibility.skillMin != null && (skill == null || skill < eligibility.skillMin))
      || (eligibility.skillMax != null && (skill == null || skill > eligibility.skillMax))) {
      fail('ELIGIBILITY_FAILED', `athlete ${registration.athlete_id ?? 'unknown'} does not meet eligibility`);
    }
  }
  return { ok: true, count: registrations.length };
}

const DIVISION_PLAY_TYPES = new Set(['singles', 'doubles', 'team']);
const DIVISION_SCORING_SCOPES = new Set(['athlete', 'club']);
const DIVISION_RATING_POLICIES = new Set(['open', 'capped']);
const DIVISION_PAIRING_MODES = new Set(['none', 'manual', 'random_balanced']);

function validateDivisionOptions(input = {}) {
  const value = {
    play_type: input.play_type || 'team',
    scoring_scope: input.scoring_scope || 'club',
    rating_policy: input.rating_policy || 'open',
    rating_cap: input.rating_cap == null || input.rating_cap === '' ? null : Number(input.rating_cap),
    pairing_mode: input.pairing_mode || 'none',
    scoring_override: input.scoring_override ?? null,
    tiebreak_override: input.tiebreak_override ?? null,
  };
  if (!DIVISION_PLAY_TYPES.has(value.play_type)) fail('INVALID_PLAY_TYPE', 'play_type is invalid');
  if (!DIVISION_SCORING_SCOPES.has(value.scoring_scope)) fail('INVALID_SCORING_SCOPE', 'scoring_scope is invalid');
  if (!DIVISION_RATING_POLICIES.has(value.rating_policy)) fail('INVALID_RATING_POLICY', 'rating_policy is invalid');
  if (!DIVISION_PAIRING_MODES.has(value.pairing_mode)) fail('INVALID_PAIRING_MODE', 'pairing_mode is invalid');
  if (value.rating_policy === 'capped' && (!Number.isFinite(value.rating_cap) || value.rating_cap <= 0)) fail('RATING_CAP_REQUIRED', 'rating_cap is required for capped policy');
  if (value.rating_policy === 'open') value.rating_cap = null;
  if (value.play_type === 'singles' && value.pairing_mode !== 'none') fail('SINGLES_PAIRING_FORBIDDEN', 'singles requires pairing_mode none');
  return value;
}

function validateTournamentClubReference(input = {}) {
  const hasClub = input.club_id != null;
  const hasExternal = input.external_club_id != null;
  if (hasClub === hasExternal) fail(hasClub ? 'CLUB_REFERENCE_EXCLUSIVE' : 'CLUB_REFERENCE_REQUIRED', 'exactly one club reference is required');
  return { club_id: hasClub ? input.club_id : null, external_club_id: hasExternal ? input.external_club_id : null };
}

function validateTournamentAthlete(input = {}) {
  const hasAthlete = input.athlete_id != null;
  const displayName = String(input.display_name_snapshot || '').trim();
  if (hasAthlete && displayName) fail('ATHLETE_IDENTITY_AMBIGUOUS', 'athlete_id and display_name_snapshot are mutually exclusive');
  if (!hasAthlete && !displayName) fail('ATHLETE_IDENTITY_REQUIRED', 'athlete identity or display snapshot is required');
  if (input.phr_rating != null && (!Number.isFinite(Number(input.phr_rating)) || Number(input.phr_rating) < 0)) fail('INVALID_PHR_RATING', 'phr_rating is invalid');
  if (input.phr_status != null && !['unverified', 'pending', 'confirmed'].includes(input.phr_status)) fail('INVALID_PHR_STATUS', 'phr_status is invalid');
  return { athlete_id: hasAthlete ? input.athlete_id : null, display_name_snapshot: displayName || null, phr_rating: input.phr_rating == null ? null : Number(input.phr_rating), phr_status: input.phr_status || 'unverified' };
}

function validateTournamentPairMembers(members = []) {
  if (!Array.isArray(members) || members.length !== 2) fail('PAIR_MEMBER_COUNT', 'a pair requires exactly two members');
  const ids = members.map((member) => String(member?.tournament_athlete_id ?? ''));
  if (ids.some((id) => !id)) fail('PAIR_MEMBER_ID_REQUIRED', 'pair member identity is required');
  if (new Set(ids).size !== ids.length) fail('PAIR_DUPLICATE_ATHLETE', 'pair cannot contain duplicate athletes');
  return members.map((member) => ({ tournament_athlete_id: member.tournament_athlete_id, role: member.role || 'player' }));
}

function seededShuffle(items, seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  const output = items.slice();
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function buildDoublesPairingPreview({ play_type, pairing_mode = 'none', athletes = [], seed = 1 } = {}) {
  if (play_type === 'singles' && pairing_mode !== 'none') fail('SINGLES_PAIRING_FORBIDDEN', 'singles requires pairing_mode none');
  if (play_type !== 'doubles') return { entries: athletes.slice(), pairs: [], warnings: [] };
  if (!['manual', 'random_balanced'].includes(pairing_mode)) fail('INVALID_PAIRING_MODE', 'doubles requires manual or random_balanced pairing');
  if (!Array.isArray(athletes) || athletes.length % 2 !== 0) fail('PAIRING_EVEN_COUNT_REQUIRED', 'doubles pairing requires an even number of athletes');
  const warnings = [];
  const hasCompleteRatings = athletes.length > 0 && athletes.every((athlete) => Number.isFinite(Number(athlete.phr_rating)));
  let ordered;
  if (pairing_mode === 'manual') {
    ordered = athletes.slice();
  } else if (hasCompleteRatings) {
    ordered = athletes.slice().sort((a, b) => (Number(b.phr_rating) - Number(a.phr_rating)) || String(a.id).localeCompare(String(b.id)));
  } else {
    ordered = seededShuffle(athletes, seed);
    if (athletes.length) warnings.push({ code: 'PHR_RATING_MISSING', message: 'Thiếu PHR, pairing dùng random theo seed' });
  }
  const pairs = [];
  const pairSources = hasCompleteRatings && pairing_mode === 'random_balanced'
    ? ordered.slice(0, ordered.length / 2).map((first, index) => [first, ordered[ordered.length - 1 - index]])
    : ordered.reduce((all, athlete, index) => {
      if (index % 2 === 0) all.push([athlete]);
      else all[all.length - 1].push(athlete);
      return all;
    }, []);
  for (const [first, second] of pairSources) {
    pairs.push({
      id: `${first.id}:${second.id}`,
      status: 'preview',
      members: [
        { tournament_athlete_id: first.tournament_athlete_id ?? first.id, phr_rating_snapshot: first.phr_rating ?? null },
        { tournament_athlete_id: second.tournament_athlete_id ?? second.id, phr_rating_snapshot: second.phr_rating ?? null },
      ],
      phr_rating_snapshot: hasCompleteRatings ? Number(first.phr_rating) + Number(second.phr_rating) : null,
      club_ids: [...new Set([first.club_id, second.club_id].filter((clubId) => clubId != null))],
    });
  }
  return { entries: [], pairs, warnings };
}

function validateDivisionPairAssignments(pairs = []) {
  const seen = new Set();
  for (const pair of pairs) {
    for (const member of pair?.members || []) {
      const athleteId = member?.tournament_athlete_id;
      if (athleteId == null) fail('PAIR_MEMBER_ID_REQUIRED', 'pair member identity is required');
      const key = String(athleteId);
      if (seen.has(key)) fail('DIVISION_ATHLETE_DUPLICATE', `athlete ${athleteId} appears in multiple pairs`);
      seen.add(key);
    }
  }
  return pairs.map((pair) => ({ ...pair, members: pair.members.map((member) => ({ ...member })) }));
}

function lockPairSnapshot(pair = {}) {
  const snapshot = JSON.parse(JSON.stringify(pair));
  snapshot.status = 'locked';
  return snapshot;
}

function validateInterclubPool(entries = [], { policy = 'spread_if_possible' } = {}) {
  if (!['unique_per_pool', 'spread_if_possible', 'allow_multiple'].includes(policy)) fail('INVALID_POOL_POLICY', 'pool policy is invalid');
  const clubs = new Set();
  const warnings = [];
  for (const entry of entries) {
    if (entry.club_id == null && entry.external_club_id == null) fail('ENTRY_CLUB_REQUIRED', 'every entry needs club reference');
    const clubId = entry.club_id ?? `external:${entry.external_club_id}`;
    if (clubs.has(String(clubId))) {
      if (policy === 'unique_per_pool') fail('POOL_CLUB_DUPLICATE', `club ${clubId} appears more than once in pool`);
      if (policy === 'spread_if_possible') warnings.push({ code: 'POOL_CLUB_SPREAD_LIMITED', club_id: clubId, message: 'Không thể rải đều toàn bộ entry theo CLB trong pool này' });
    }
    clubs.add(String(clubId));
  }
  return { entries: entries.slice().sort((a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER)), warnings };
}

function aggregateClubStandings(matches = [], entries = [], options = {}) {
  const byEntrant = new Map(entries.map((entry) => [String(entry.id), entry]));
  const rows = new Map(entries.map((entry) => [String(entry.club_id), {
    club_id: entry.club_id, played: 0, won: 0, lost: 0,
    points_for: 0, points_against: 0, diff: 0, match_points: 0,
  }]));
  const winPoints = options.winPoints ?? 2;
  for (const match of matches) {
    if (match.status !== 'done' || !match.winner_entrant_id) continue;
    const a = byEntrant.get(String(match.entrant_a_id));
    const b = byEntrant.get(String(match.entrant_b_id));
    if (!a || !b || a.club_id === b.club_id) continue;
    const ra = rows.get(String(a.club_id));
    const rb = rows.get(String(b.club_id));
    const pointsA = Number(match.points_a || 0);
    const pointsB = Number(match.points_b || 0);
    const aWon = String(match.winner_entrant_id) === String(match.entrant_a_id);
    ra.played += 1; rb.played += 1;
    ra.points_for += pointsA; ra.points_against += pointsB;
    rb.points_for += pointsB; rb.points_against += pointsA;
    if (aWon) { ra.won += 1; rb.lost += 1; ra.match_points += winPoints; }
    else { rb.won += 1; ra.lost += 1; rb.match_points += winPoints; }
  }
  const result = [...rows.values()].map((row) => ({ ...row, diff: row.points_for - row.points_against }));
  result.sort((a, b) => (b.match_points - a.match_points) || (b.diff - a.diff) || (b.points_for - a.points_for) || (Number(a.club_id) - Number(b.club_id)));
  result.forEach((row, index) => { row.rank = index + 1; });
  return result;
}

function buildPublicInterclubProjection({ tournament, clubs = [], divisions = [], entries = [], matches = [], games = [] } = {}) {
  const pick = (row, fields) => fields.reduce((out, field) => { if (row && row[field] !== undefined) out[field] = row[field]; return out; }, {});
  return {
    tournament: pick(tournament, ['id', 'name', 'description', 'location', 'event_date', 'status', 'public_slug', 'organizer_type']),
    clubs: clubs.map((row) => pick(row, ['id', 'club_id', 'name', 'invitation_status', 'quota'])),
    divisions: divisions.map((row) => pick(row, ['id', 'name', 'entrant_type', 'competition_template', 'ruleset_version', 'competition_status'])),
    entries: entries.map((row) => ({ ...pick(row, ['id', 'division_id', 'tournament_club_id', 'color_snapshot', 'seed']), name: row.name_snapshot })),
    matches: matches.map((row) => pick(row, ['id', 'stage_id', 'division_id', 'round', 'bracket_slot', 'group_label', 'court', 'match_order', 'entrant_a_id', 'entrant_b_id', 'status', 'winner_entrant_id'])),
    games: games.map((row) => pick(row, ['id', 'match_id', 'game_no', 'kind', 'score_a', 'score_b', 'winner_entrant_id', 'lineup'])),
  };
}

module.exports = {
  InterclubError,
  assertTournamentOrganizer,
  transitionTournamentClub,
  transitionRegistration,
  validateRosterSubmission,
  validateDivisionOptions,
  validateTournamentClubReference,
  validateTournamentAthlete,
  validateTournamentPairMembers,
  buildDoublesPairingPreview,
  validateDivisionPairAssignments,
  lockPairSnapshot,
  validateInterclubPool,
  aggregateClubStandings,
  buildPublicInterclubProjection,
};
