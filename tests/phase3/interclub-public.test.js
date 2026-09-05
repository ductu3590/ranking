const { buildPublicInterclubProjection } = require('../../lib/tournament/interclub');
const assert = (condition, message) => { if (!condition) { console.error(`FAIL: ${message}`); process.exit(1); } };

const projection = buildPublicInterclubProjection({
  tournament: { id: 1, name: 'Giao Hữu', public_slug: 'giao-huu', organizer_type: 'platform', created_by_profile_id: 99, private_note: 'secret' },
  clubs: [{ id: 5, club_id: 10, name: 'CLB A', invitation_status: 'approved', captain_contact_profile_id: 77 }],
  divisions: [{ id: 6, name: 'Đồng đội', entrant_type: 'team', competition_template: 'interclub_friendly_team_v1', private_rules: 'secret' }],
  entries: [{ id: 7, division_id: 6, tournament_club_id: 5, name_snapshot: 'Đội A', color_snapshot: '#fff', seed: 1, private_note: 'secret' }],
  matches: [{ id: 8, stage_id: 9, round: 1, entrant_a_id: 7, entrant_b_id: 8, status: 'pending', private_note: 'secret' }],
  games: [{ id: 10, match_id: 8, game_no: 1, kind: 'womens', score_a: 11, score_b: 9, lineup: { public: true }, private_note: 'secret' }],
});
assert(projection.tournament.created_by_profile_id === undefined, 'ẩn created_by_profile_id');
assert(projection.clubs[0].captain_contact_profile_id === undefined, 'ẩn captain contact');
assert(projection.entries[0].name === 'Đội A' && projection.entries[0].private_note === undefined, 'entry public allowlist');
assert(projection.matches[0].private_note === undefined && projection.games[0].private_note === undefined, 'ẩn private fields match/game');
console.log('phase3 interclub public ok');
