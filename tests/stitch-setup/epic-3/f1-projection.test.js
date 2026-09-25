'use strict';
// Epic 3 F1 §8 — chiếu dữ liệu theo allowlist (README §7.3): khách không thấy khóa cấm; chủ nhà không thấy roster_draft/băm token.

const { assert, lib, suite } = require('../_harness');
const F = lib('lib/tournament/friendlyClubs.js');

const HASH = 'a'.repeat(64);
const DRAFT = {
  memberIds: ['991', '992', '993'],
  pairs: [{ pairId: 'pair_x', participantRefs: ['member:991', 'member:992'], locked: false }],
  unpairedRefs: ['member:993'],
};
const SUBMITTED = {
  memberIds: ['991', '992'],
  pairs: [{ pairId: 'pair_x', participantRefs: ['member:991', 'member:992'], locked: false }],
  unpairedRefs: [],
  memberNames: { 991: 'Nguyễn Văn A', 992: 'Trần B' },
  pairCount: 1,
};
// Dòng DB đầy đủ, cố tình mang mọi cột nhạy cảm + cột lạ.
const ROW = {
  id: 881, group_id: 59, tournament_id: 7, club_id: 19, invitation_status: 'roster_submitted', quota: 3, version: 6,
  captain_contact_profile_id: 4242, invitation_note: 'Mời CLB giao lưu', review_note: null,
  roster_draft: DRAFT, roster_submitted: SUBMITTED, roster_submitted_at: '2026-09-27T01:00:00Z', roster_reviewed_at: null,
  responded_at: '2026-09-26T03:00:00Z', roster_approved_version: null, invite_token_hash: HASH,
  invite_token_issued_at: '2026-09-26T02:12:00Z', created_at: '2026-09-26T02:12:00Z', updated_at: '2026-09-27T01:00:00Z',
  phone: '0900000000', private_note: 'bí mật', external_club_id: null,
};
const TOURNAMENT = {
  id: 7, group_id: 59, name: 'Giao hữu Thu 2026', event_date: '2026-10-12', location: 'Sân A', description: 'Giải vui',
  status: 'draft', visibility: 'private', public_slug: 'gh-thu', organizer_club_id: 59,
  settings: { organizer_mode: 'friendly', start_time: '07:30', friendly: { registrationDeadline: null, registrationLockedAt: null }, contact_phone: '0911111111' },
};
const HOST_CLUB = { id: 59, name: 'CLB Test 23.9.2026', logoUrl: null, logo_url: null, code: 'CLB59', phone: '0922' };
const WINDOW = { open: true, reason: null, deadline: '2026-10-05T23:59:00+07:00', lockedAt: null };

// Danh sách cấm của README §7.3 + F1 §8 f1-projection.
const GUEST_FORBIDDEN = ['group_id', 'groupId', 'hostGroupId', 'club_id', 'captain_contact_profile_id', 'captainContactProfileId',
  'roster_draft', 'phone', 'contact_phone', 'private_note', 'invite_token_hash', 'inviteTokenHash', 'clubs', 'code', 'tournament_id', 'settings'];
const HOST_FORBIDDEN = ['rosterDraft', 'roster_draft', 'invite_token_hash', 'inviteTokenHash', 'captain_contact_profile_id', 'phone', 'private_note', 'unpairedRefs'];

function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, out));
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) { out.add(key); allKeys(inner, out); }
  }
  return out;
}
const guestView = (over = {}) => F.projectInvitationForGuest({ row: ROW, tournament: TOURNAMENT, hostClub: HOST_CLUB, window: WINDOW, formatLabel: 'Vòng bảng → Loại trực tiếp', publicUrl: null, ...over });

suite('f1 projection', {
  'projectInvitationForGuest không bao giờ có khóa cấm, không lộ băm token/số điện thoại ở giá trị'() {
    for (const status of F.FRIENDLY_STATUSES) {
      const view = guestView({ row: { ...ROW, invitation_status: status } });
      const keys = allKeys(view);
      for (const forbidden of GUEST_FORBIDDEN) assert.equal(keys.has(forbidden), false, `${status}: ${forbidden}`);
      const text = JSON.stringify(view);
      for (const secret of [HASH, '0900000000', '0911111111', '0922', 'CLB59', 'bí mật', '4242']) {
        assert.equal(text.includes(secret), false, `${status}: ${secret}`);
      }
    }
  },

  'projectInvitationForGuest: shape theo §6.2'() {
    const view = guestView();
    assert.deepEqual(view, {
      id: 881,
      tournament: { name: 'Giao hữu Thu 2026', eventDate: '2026-10-12', startTime: '07:30', location: 'Sân A', status: 'draft' },
      hostClub: { name: 'CLB Test 23.9.2026', logoUrl: null },
      status: 'roster_submitted', statusLabel: 'Chờ duyệt', quota: 3, pairCount: 1,
      window: { deadline: '2026-10-05T23:59:00+07:00', open: true, reason: null }, finalized: false, publicUrl: null,
      formatLabel: 'Vòng bảng → Loại trực tiếp', description: 'Giải vui', invitationNote: 'Mời CLB giao lưu', reviewNote: null,
      version: 6, canEdit: false, actions: ['unsubmit', 'withdraw'],
      rosterDraft: DRAFT,
      rosterSubmitted: {
        pairCount: 1, submittedAt: '2026-09-27T01:00:00Z',
        pairs: [{ pairId: 'pair_x', members: [{ memberId: '991', name: 'Nguyễn Văn A' }, { memberId: '992', name: 'Trần B' }] }],
      },
    });
  },

  'projectInvitationForGuest: canEdit khi accepted/changes_requested và cửa sổ mở; đóng → không'() {
    assert.equal(guestView({ row: { ...ROW, invitation_status: 'accepted' } }).canEdit, true);
    assert.equal(guestView({ row: { ...ROW, invitation_status: 'changes_requested', review_note: 'Sửa cặp 2' } }).reviewNote, 'Sửa cặp 2');
    const closed = guestView({ row: { ...ROW, invitation_status: 'accepted' }, window: { open: false, reason: 'LOCKED', deadline: null, lockedAt: 'x' } });
    assert.equal(closed.canEdit, false);
    assert.deepEqual(closed.actions, []);
  },

  'projectInvitationForGuest: finalized + publicUrl chỉ khi đã chốt'() {
    const view = guestView({ window: { open: false, reason: 'FINALIZED', deadline: null, lockedAt: null }, publicUrl: '/giai-dau/v2/gh-thu' });
    assert.equal(view.finalized, true);
    assert.equal(view.publicUrl, '/giai-dau/v2/gh-thu');
    assert.equal(guestView({ publicUrl: '/giai-dau/v2/gh-thu' }).publicUrl, null, 'chưa chốt không trả link công khai');
  },

  'projectInvitationForGuest: chưa gửi → rosterSubmitted null, pairCount theo bản nháp; roster_draft rác được chuẩn hoá'() {
    const view = guestView({ row: { ...ROW, invitation_status: 'accepted', roster_submitted: null, roster_submitted_at: null, roster_draft: { memberIds: ['1', '2'], pairs: [{ pairId: 'p', participantRefs: ['member:1', 'guest:g_abcdef12'] }], junk: 1 } } });
    assert.equal(view.rosterSubmitted, null);
    assert.equal(view.pairCount, 0);
    assert.deepEqual(view.rosterDraft, { memberIds: ['1', '2'], pairs: [], unpairedRefs: ['member:1', 'member:2'] });
  },

  'projectClubForHost không có rosterDraft, invite_token_hash; shape theo §6.1'() {
    const view = F.projectClubForHost(ROW, { clubName: 'CLB Test Responsive UI', logoUrl: null });
    const keys = allKeys(view);
    for (const forbidden of HOST_FORBIDDEN) assert.equal(keys.has(forbidden), false, forbidden);
    assert.equal(JSON.stringify(view).includes(HASH), false);
    assert.equal(JSON.stringify(view).includes('993'), false, 'người chỉ có trong bản nháp không lộ');
    assert.deepEqual(view, {
      id: 881, clubId: 19, name: 'CLB Test Responsive UI', logoUrl: null, isHost: false,
      status: 'roster_submitted', statusLabel: 'Chờ duyệt', quota: 3, version: 6,
      invitationNote: 'Mời CLB giao lưu', reviewNote: null, respondedAt: '2026-09-26T03:00:00Z', submittedAt: '2026-09-27T01:00:00Z',
      reviewedAt: null, approvedVersion: null, inviteLinkIssuedAt: '2026-09-26T02:12:00Z', hasInviteLink: true,
      submitted: { pairCount: 1, pairs: [{ pairId: 'pair_x', members: [{ memberId: '991', name: 'Nguyễn Văn A' }, { memberId: '992', name: 'Trần B' }] }] },
    });
  },

  'projectClubForHost: ảnh chụp chỉ hiện khi đang chờ duyệt / đã duyệt / cần sửa'() {
    const shown = ['roster_submitted', 'approved', 'changes_requested'];
    for (const status of F.FRIENDLY_STATUSES) {
      const view = F.projectClubForHost({ ...ROW, invitation_status: status }, { clubName: 'X' });
      assert.equal(view.submitted !== null, shown.includes(status), status);
    }
  },

  'projectClubForHost: không có link → hasInviteLink false, inviteLinkIssuedAt null; dòng chủ nhà isHost'() {
    const view = F.projectClubForHost({ ...ROW, invite_token_hash: null, invite_token_issued_at: '2026-09-26T02:12:00Z' }, { clubName: 'X' });
    assert.equal(view.hasInviteLink, false);
    assert.equal(view.inviteLinkIssuedAt, null);
    assert.equal(F.projectClubForHost({ ...ROW, club_id: 59, invitation_status: 'approved' }, { clubName: 'Chủ nhà' }).isHost, true);
  },

  'tên thành viên thiếu trong memberNames → null, không lấy từ nguồn khác'() {
    const view = F.projectClubForHost({ ...ROW, roster_submitted: { ...SUBMITTED, memberNames: { 991: 'A' } } }, { clubName: 'X' });
    assert.deepEqual(view.submitted.pairs[0].members, [{ memberId: '991', name: 'A' }, { memberId: '992', name: null }]);
  },
});
