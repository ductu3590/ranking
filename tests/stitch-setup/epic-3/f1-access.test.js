'use strict';
// Epic 3 F1 §8 — quyền "CLB tham dự" (README §6): resolveParticipantClubAccess thuần.

const { assert, lib, suite } = require('../_harness');
const A = lib('lib/tournament/access.js');

const TOURNAMENT = { id: 7, group_id: 59, organizer_type: 'club', organizer_club_id: 59, visibility: 'private', settings: { organizer_mode: 'friendly' } };
const ROW = { id: 881, group_id: 59, tournament_id: 7, club_id: 19, invitation_status: 'invited' };
const decide = (actor, over = {}) => A.resolveParticipantClubAccess({ tournament: TOURNAMENT, tournamentClub: ROW, actor, ...over });

const denied404 = (result) => {
  assert.equal(result.allowed, false);
  assert.equal(result.status, 404);
  assert.equal(result.code, 'TOURNAMENT_NOT_FOUND');
};

suite('f1 access', {
  'admin CLB khách đúng dòng → cho, shape đủ'() {
    const result = decide({ kind: 'group', groupId: 19, role: 'admin' });
    assert.deepEqual(result, {
      allowed: true, code: null, message: null, status: 200,
      actorKind: 'participant_club', groupId: 59, clubGroupId: 19, tournamentClubId: 881, canReadPrivate: false,
    });
    assert.equal(decide({ kind: 'group', group_id: '19', role: 'admin' }).allowed, true, 'nhận group_id dạng chuỗi');
  },

  'thành viên CLB khách → 403 GROUP_ADMIN_REQUIRED'() {
    const result = decide({ kind: 'group', groupId: 19, role: 'member' });
    assert.deepEqual([result.allowed, result.status, result.code], [false, 403, 'GROUP_ADMIN_REQUIRED']);
  },

  'admin CLB khác → 404; thành viên CLB khác → 404 (không lộ bằng 403)'() {
    denied404(decide({ kind: 'group', groupId: 23, role: 'admin' }));
    denied404(decide({ kind: 'group', groupId: 23, role: 'member' }));
  },

  'admin chủ nhà qua đường này → 404 (chủ nhà đi requireTournamentAccess)'() {
    denied404(decide({ kind: 'group', groupId: 59, role: 'admin' }));
    const selfRow = { ...ROW, club_id: 59 };
    denied404(decide({ kind: 'group', groupId: 59, role: 'admin' }, { tournamentClub: selfRow }));
  },

  'giải không friendly → 404'() {
    denied404(decide({ kind: 'group', groupId: 19, role: 'admin' }, { tournament: { ...TOURNAMENT, settings: { organizer_mode: 'internal' } } }));
    denied404(decide({ kind: 'group', groupId: 19, role: 'admin' }, { tournament: { ...TOURNAMENT, settings: null } }));
  },

  'dòng CLB không thuộc giải này → 404'() {
    denied404(decide({ kind: 'group', groupId: 19, role: 'admin' }, { tournamentClub: { ...ROW, tournament_id: 8 } }));
    denied404(decide({ kind: 'group', groupId: 19, role: 'admin' }, { tournamentClub: { ...ROW, group_id: 60 } }));
  },

  'platform actor → 404; không phiên / thiếu dữ liệu → 404'() {
    denied404(decide({ kind: 'platform', role: 'platform_admin', accountId: 1 }));
    denied404(decide(null));
    denied404(decide({ kind: 'group', groupId: 19, role: 'admin' }, { tournamentClub: null }));
    denied404(decide({ kind: 'group', groupId: 19, role: 'admin' }, { tournament: null }));
    denied404(A.resolveParticipantClubAccess());
  },

  'resolveTournamentWrite của khách trên giải chủ nhà vẫn 404; read cũng 404'() {
    const actor = { kind: 'group', groupId: 19, role: 'admin' };
    denied404(A.resolveTournamentWrite({ tournament: TOURNAMENT, actor }));
    denied404(A.resolveTournamentRead({ tournament: TOURNAMENT, actor }));
  },
});
