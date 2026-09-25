'use strict';
// Epic 3 F1 §8 — thông báo trong app (D47): trạng thái mong muốn theo invitation_status + chiếu hiển thị cho chuông.

const { assert, lib, suite } = require('../_harness');
const N = lib('lib/tournament/friendlyNotifications.js');

const STATUSES = ['invited', 'accepted', 'declined', 'roster_submitted', 'changes_requested', 'approved', 'withdrawn'];

const guestRow = (reason, extra = {}) => ({
  id: 5, group_id: 19, kind: 'tournament_invitation', subject_type: 'tournament_club', subject_id: 881, status: 'open',
  created_at: '2026-09-26T02:00:00Z',
  payload: { reason, tournamentName: 'Giao hữu Thu 2026', hostClubName: 'CLB Test 23.9.2026', eventDate: '2026-10-12', ...extra },
});
const hostRow = (extra = {}) => ({
  id: 6, group_id: 59, kind: 'tournament_roster_review', subject_type: 'tournament_club', subject_id: 881, status: 'open',
  payload: { reason: 'roster_submitted', tournamentName: 'Giao hữu Thu 2026', guestClubName: 'CLB Test Responsive UI', pairCount: 3, tournamentId: 7, divisionId: 12, ...extra },
});

function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, out));
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) { out.add(key); allKeys(inner, out); }
  }
  return out;
}

suite('f1 notifications', {
  'FRIENDLY_NOTIFICATION_KINDS'() {
    assert.deepEqual({ ...N.FRIENDLY_NOTIFICATION_KINDS }, { guest: 'tournament_invitation', host: 'tournament_roster_review' });
    assert.equal(N.FRIENDLY_NOTIFICATION_SUBJECT_TYPE, 'tournament_club');
  },

  'desiredNotificationState cho 7 trạng thái'() {
    const expected = {
      invited: { guest: 'open', guestReason: 'invited', host: 'resolved' },
      accepted: { guest: 'resolved', guestReason: null, host: 'resolved' },
      declined: { guest: 'resolved', guestReason: null, host: 'resolved' },
      roster_submitted: { guest: 'resolved', guestReason: null, host: 'open' },
      changes_requested: { guest: 'open', guestReason: 'changes_requested', host: 'resolved' },
      approved: { guest: 'resolved', guestReason: null, host: 'resolved' },
      withdrawn: { guest: 'resolved', guestReason: null, host: 'resolved' },
    };
    for (const status of STATUSES) assert.deepEqual(N.desiredNotificationState(status), expected[status], status);
    assert.deepEqual(N.desiredNotificationState('bogus'), { guest: 'resolved', guestReason: null, host: 'resolved' });
  },

  'bảng cho khối SQL -- friendly:notifications: 7 dòng, khớp desiredNotificationState'() {
    const sql = N.renderFriendlyNotificationsSql();
    const lines = sql.split('\n');
    assert.equal(lines.length, 7);
    for (const status of STATUSES) {
      const s = N.desiredNotificationState(status);
      const reason = s.guestReason ? `'${s.guestReason}'` : 'NULL';
      assert.ok(lines.some((line) => line.replace(/,$/, '') === `('${status}', '${s.guest}', ${reason}, '${s.host}')`), status);
    }
  },

  'projectClubNotification: lời mời (invited)'() {
    const view = N.projectClubNotification(guestRow('invited'));
    assert.deepEqual(view.display, {
      title: 'CLB Test 23.9.2026 mời CLB bạn dự giải',
      body: 'Giao hữu Thu 2026 · 12/10/2026',
      href: '/giai-dau/loi-moi/881',
      actionLabel: 'Xem lời mời',
    });
    assert.equal(view.id, 5);
    assert.equal(view.status, 'open');
  },

  'projectClubNotification: yêu cầu sửa (changes_requested)'() {
    const view = N.projectClubNotification(guestRow('changes_requested'));
    assert.deepEqual(view.display, {
      title: 'Chủ nhà yêu cầu sửa danh sách cặp',
      body: 'Giao hữu Thu 2026',
      href: '/giai-dau/loi-moi/881',
      actionLabel: 'Sửa danh sách',
    });
  },

  'projectClubNotification: lời mời không có ngày → body chỉ tên giải'() {
    assert.equal(N.projectClubNotification(guestRow('invited', { eventDate: null })).display.body, 'Giao hữu Thu 2026');
  },

  'projectClubNotification: cần duyệt (chủ nhà)'() {
    const view = N.projectClubNotification(hostRow());
    assert.deepEqual(view.display, {
      title: 'CLB Test Responsive UI gửi 3 cặp',
      body: 'Giao hữu Thu 2026 · cần duyệt',
      href: '/giai-dau/v2?create=internal&tournamentId=7&divisionId=12&step=2',
      actionLabel: 'Duyệt',
    });
  },

  'projectClubNotification: cần duyệt thiếu tournamentId/divisionId → href an toàn'() {
    assert.equal(N.projectClubNotification(hostRow({ tournamentId: undefined, divisionId: undefined })).display.href, '/giai-dau/v2');
  },

  'kind lạ (unassigned_transaction) → display null, row giữ nguyên'() {
    const row = { id: 1, group_id: 59, kind: 'unassigned_transaction', subject_type: 'quy_pickleball', subject_id: 3, payload: { so_tien: 50000 } };
    const view = N.projectClubNotification(row);
    assert.equal(view.display, null);
    const { display, ...rest } = view;
    assert.deepEqual(rest, row);
    assert.notEqual(view, row, 'không sửa tại chỗ');
    assert.equal('display' in row, false);
  },

  'payload khách chỉ theo allowlist: không tournamentId / group_id chủ nhà'() {
    const view = N.projectClubNotification(guestRow('invited', { tournamentId: 7, group_id: 59, hostGroupId: 59, invite_token_hash: 'a'.repeat(64) }));
    assert.deepEqual(Object.keys(view.payload).sort(), ['eventDate', 'hostClubName', 'reason', 'tournamentName']);
    const keys = allKeys(view);
    for (const forbidden of ['tournamentId', 'hostGroupId', 'invite_token_hash', 'divisionId']) assert.equal(keys.has(forbidden), false, forbidden);
    assert.equal(view.group_id, 19, 'group_id của dòng là CLB nhận (chính mình)');
    assert.deepEqual([...N.NOTIFICATION_PAYLOAD_KEYS.guest], ['reason', 'tournamentName', 'hostClubName', 'eventDate']);
    assert.deepEqual([...N.NOTIFICATION_PAYLOAD_KEYS.host], ['reason', 'tournamentName', 'guestClubName', 'pairCount', 'tournamentId', 'divisionId']);
  },

  'isFriendlyNotificationKind'() {
    assert.equal(N.isFriendlyNotificationKind('tournament_invitation'), true);
    assert.equal(N.isFriendlyNotificationKind('tournament_roster_review'), true);
    assert.equal(N.isFriendlyNotificationKind('unassigned_transaction'), false);
  },

  'shouldResolveNotification: tự sửa lệch khi dòng mồ côi hoặc trạng thái không còn mở'() {
    assert.equal(N.shouldResolveNotification(guestRow('invited'), null), true, 'giải bị xoá → mồ côi');
    assert.equal(N.shouldResolveNotification(guestRow('invited'), { invitation_status: 'invited' }), false);
    assert.equal(N.shouldResolveNotification(guestRow('invited'), { invitation_status: 'accepted' }), true);
    assert.equal(N.shouldResolveNotification(hostRow(), { invitation_status: 'roster_submitted' }), false);
    assert.equal(N.shouldResolveNotification(hostRow(), { invitation_status: 'approved' }), true);
    assert.equal(N.shouldResolveNotification({ kind: 'unassigned_transaction' }, null), false, 'kind khác không đụng');
  },
});
