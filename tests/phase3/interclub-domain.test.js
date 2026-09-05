const {
  assertTournamentOrganizer,
  transitionTournamentClub,
  transitionRegistration,
  validateRosterSubmission,
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
console.log('phase3 interclub domain ok');
