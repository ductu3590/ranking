const {
  assertTournamentOrganizer,
  transitionTournamentClub,
  transitionRegistration,
  validateRosterSubmission,
  validateDivisionOptions,
  validateTournamentClubReference,
  validateTournamentAthlete,
  validateTournamentPairMembers,
} = require('../../lib/tournament/interclub');

const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};
const throwsCode = (fn, code) => {
  try { fn(); } catch (error) { return error.code === code; }
  return false;
};

assert(assertTournamentOrganizer({ organizer_type: 'platform' }).organizer_type === 'platform', 'platform organizer hợp lệ');
assert(assertTournamentOrganizer({ organizer_type: 'club', organizer_club_id: 10 }).organizer_club_id === 10, 'club organizer hợp lệ');
assert(throwsCode(() => assertTournamentOrganizer({ organizer_type: 'club' }), 'ORGANIZER_CLUB_REQUIRED'), 'club thiếu organizer_club_id bị từ chối');
assert(throwsCode(() => assertTournamentOrganizer({ organizer_type: 'platform', organizer_club_id: 10 }), 'ORGANIZER_CLUB_FORBIDDEN'), 'platform không nhận organizer_club_id');

assert(transitionTournamentClub('invited', 'accept') === 'accepted', 'accept invitation');
assert(transitionTournamentClub('accepted', 'submit_roster') === 'roster_submitted', 'submit roster');
assert(transitionTournamentClub('roster_submitted', 'request_changes') === 'changes_requested', 'request changes');
assert(transitionTournamentClub('changes_requested', 'submit_roster') === 'roster_submitted', 'resubmit roster');
assert(transitionTournamentClub('roster_submitted', 'approve') === 'approved', 'approve roster');
assert(throwsCode(() => transitionTournamentClub('invited', 'approve'), 'INVALID_CLUB_TRANSITION'), 'không approve trực tiếp invitation');

assert(transitionRegistration('draft', 'submit') === 'submitted', 'submit registration');
assert(transitionRegistration('submitted', 'approve') === 'approved', 'approve registration');
assert(throwsCode(() => transitionRegistration('approved', 'submit'), 'INVALID_REGISTRATION_TRANSITION'), 'registration approved không submit lại');

const roster = [
  { athlete_id: 1, age: 30, gender: 'm', skill: 3.2 },
  { athlete_id: 2, age: 28, gender: 'f', skill: 3.4 },
];
assert(validateRosterSubmission({ registrations: roster, quota: 2, eligibility: { minAge: 18, maxAge: 60 } }).ok, 'roster hợp lệ');
assert(throwsCode(() => validateRosterSubmission({ registrations: [...roster, { athlete_id: 3 }], quota: 2 }), 'QUOTA_EXCEEDED'), 'vượt quota');
assert(throwsCode(() => validateRosterSubmission({ registrations: [{ athlete_id: 1 }, { athlete_id: 1 }], quota: 3 }), 'DUPLICATE_ATHLETE'), 'trùng athlete');
assert(throwsCode(() => validateRosterSubmission({ registrations: [{ athlete_id: 3, age: 12 }], quota: 3, eligibility: { minAge: 18 } }), 'ELIGIBILITY_FAILED'), 'vi phạm eligibility');

const division = validateDivisionOptions({
  play_type: 'doubles', scoring_scope: 'team', rating_policy: 'cap', rating_cap: 10.5,
  pairing_mode: 'random_balanced', scoring_override: { bestOf: 3 }, tiebreak_override: { mode: 'head_to_head' },
});
assert(division.play_type === 'doubles' && division.rating_cap === 10.5, 'division options được chuẩn hóa');
assert(throwsCode(() => validateDivisionOptions({ play_type: 'doubles', rating_policy: 'cap' }), 'RATING_CAP_REQUIRED'), 'rating cap bắt buộc khi policy cap');
assert(throwsCode(() => validateDivisionOptions({ play_type: 'quadruples' }), 'INVALID_PLAY_TYPE'), 'play type không hợp lệ bị từ chối');

assert(validateTournamentClubReference({ club_id: 10 }).club_id === 10, 'PickHub club reference hợp lệ');
assert(validateTournamentClubReference({ external_club_id: 20 }).external_club_id === 20, 'external club reference hợp lệ');
assert(throwsCode(() => validateTournamentClubReference({ club_id: 10, external_club_id: 20 }), 'CLUB_REFERENCE_EXCLUSIVE'), 'không được đồng thời có hai loại club reference');
assert(throwsCode(() => validateTournamentClubReference({}), 'CLUB_REFERENCE_REQUIRED'), 'phải có một club reference');

assert(validateTournamentAthlete({ athlete_id: 5, phr_rating: 4.8, phr_status: 'confirmed' }).athlete_id === 5, 'athlete nội bộ và PHR snapshot hợp lệ');
assert(validateTournamentAthlete({ display_name_snapshot: 'VĐV khách', phr_rating: null }).display_name_snapshot === 'VĐV khách', 'guest athlete snapshot hợp lệ');
assert(throwsCode(() => validateTournamentAthlete({}), 'ATHLETE_IDENTITY_REQUIRED'), 'athlete phải có identity hoặc snapshot');
assert(throwsCode(() => validateTournamentAthlete({ athlete_id: 5, display_name_snapshot: 'Trùng' }), 'ATHLETE_IDENTITY_AMBIGUOUS'), 'athlete không nhận hai identity');

assert(validateTournamentPairMembers([{ tournament_athlete_id: 1 }, { tournament_athlete_id: 2 }]).length === 2, 'pair có hai athlete');
assert(throwsCode(() => validateTournamentPairMembers([{ tournament_athlete_id: 1 }, { tournament_athlete_id: 1 }]), 'PAIR_DUPLICATE_ATHLETE'), 'pair không trùng athlete');
assert(throwsCode(() => validateTournamentPairMembers([{ tournament_athlete_id: 1 }]), 'PAIR_MEMBER_COUNT'), 'pair phải có đủ thành viên');
console.log('phase3 interclub domain ok');
