'use strict';
// Epic 3 F1 §8 — máy trạng thái lời mời CLB, cửa sổ đăng ký, kiểm roster khi gửi, khóa cặp hiệu lực.

const { assert, lib, suite } = require('../_harness');
const F = lib('lib/tournament/friendlyClubs.js');

const STATUSES = ['invited', 'accepted', 'declined', 'roster_submitted', 'changes_requested', 'approved', 'withdrawn'];
const ACTIVE = ['invited', 'accepted', 'roster_submitted', 'changes_requested', 'approved'];

// Bảng README §4, viết lại ĐỘC LẬP với code (không import) để test so được.
// [from[], action, side, to (null = giữ nguyên), needsOpenWindow, rpc]
const EXPECTED = [
  [[null], 'invite', 'host', 'invited', false, 'invite'],
  [['declined', 'withdrawn'], 'reinvite', 'host', 'invited', false, 'invite'],
  [['invited'], 'accept', 'guest', 'accepted', true, 'action'],
  [['invited'], 'decline', 'guest', 'declined', true, 'action'],
  [['accepted', 'changes_requested'], 'save_roster', 'guest', null, true, 'action'],
  [['accepted', 'changes_requested'], 'submit_roster', 'guest', 'roster_submitted', true, 'action'],
  [['roster_submitted'], 'unsubmit', 'guest', 'accepted', true, 'action'],
  [['roster_submitted'], 'approve', 'host', 'approved', false, 'action'],
  [['roster_submitted', 'approved'], 'request_changes', 'host', 'changes_requested', true, 'action'],
  [ACTIVE, 'remove', 'host', 'withdrawn', false, 'action'],
  [['accepted', 'roster_submitted', 'changes_requested', 'approved'], 'withdraw', 'guest', 'withdrawn', true, 'action'],
  [ACTIVE, 'set_quota', 'host', null, false, 'action'],
  [STATUSES.filter((s) => s !== 'withdrawn'), 'rotate_link', 'host', null, false, 'action'],
];
const ACTIONS = [...new Set(EXPECTED.map((row) => row[1]))];

function expectedFor(status, action, side) {
  const row = EXPECTED.find(([from, a, s]) => a === action && s === side && from.includes(status));
  return row ? { to: row[3], needsOpenWindow: row[4], rpc: row[5] } : null;
}

function codeOf(fn) {
  try { fn(); } catch (error) { return error.code; }
  return null;
}

const MEMBERS = new Map([
  ['1', { active: true, hasAthlete: true, name: 'An' }],
  ['2', { active: true, hasAthlete: true, name: 'Bình' }],
  ['3', { active: true, hasAthlete: true, name: 'Chi' }],
  ['4', { active: true, hasAthlete: true, name: 'Dũng' }],
  ['5', { active: true, hasAthlete: false, name: 'Én' }],
  ['6', { active: false, hasAthlete: true, name: 'Phúc' }],
]);
const pair = (pairId, a, b) => ({ pairId, participantRefs: [`member:${a}`, `member:${b}`] });
const codes = (result) => result.blockers.map((b) => b.code);

suite('f1 friendly clubs', {
  'FRIENDLY_STATUSES đúng 7 trạng thái của cột invitation_status'() {
    assert.deepEqual([...F.FRIENDLY_STATUSES], STATUSES);
  },

  'mọi dòng bảng README §4 cho kết quả đúng (kể cả cột rpc)'() {
    for (const [from, action, side, to, needsOpenWindow, rpc] of EXPECTED) {
      for (const status of from) {
        const got = F.transitionFriendlyClub({ status, action, side });
        assert.deepEqual(got, { to, needsOpenWindow, rpc }, `${status} ${action} ${side}`);
      }
    }
  },

  'FRIENDLY_TRANSITIONS có đúng số dòng và từng dòng khớp bảng'() {
    assert.equal(F.FRIENDLY_TRANSITIONS.length, EXPECTED.length);
    for (const [from, action, side, to, needsOpenWindow, rpc] of EXPECTED) {
      const row = F.FRIENDLY_TRANSITIONS.find((r) => r.action === action && r.side === side);
      assert.ok(row, `thiếu ${action}/${side}`);
      assert.deepEqual([...row.from].sort(), [...from].sort(), action);
      assert.equal(row.to, to, action);
      assert.equal(row.needsOpenWindow, needsOpenWindow, action);
      assert.equal(row.rpc, rpc, action);
    }
  },

  'mọi bộ (trạng thái × hành động × phía) ngoài bảng → FRIENDLY_TRANSITION_INVALID'() {
    let invalid = 0;
    for (const status of [null, ...STATUSES, 'bogus']) {
      for (const action of [...ACTIONS, 'delete', '']) {
        for (const side of ['host', 'guest', 'platform', undefined]) {
          const expected = expectedFor(status, action, side);
          if (expected) continue;
          invalid += 1;
          assert.equal(codeOf(() => F.transitionFriendlyClub({ status, action, side })), 'FRIENDLY_TRANSITION_INVALID', `${status} ${action} ${side}`);
        }
      }
    }
    assert.ok(invalid > 300);
  },

  'khách không approve/rotate_link/remove/set_quota; chủ nhà không submit_roster/accept/withdraw'() {
    for (const action of ['approve', 'rotate_link', 'remove', 'set_quota', 'request_changes', 'invite', 'reinvite']) {
      for (const status of [null, ...STATUSES]) {
        assert.equal(codeOf(() => F.transitionFriendlyClub({ status, action, side: 'guest' })), 'FRIENDLY_TRANSITION_INVALID', `${status} ${action}`);
      }
    }
    for (const action of ['submit_roster', 'save_roster', 'accept', 'decline', 'unsubmit', 'withdraw']) {
      for (const status of STATUSES) {
        assert.equal(codeOf(() => F.transitionFriendlyClub({ status, action, side: 'host' })), 'FRIENDLY_TRANSITION_INVALID', `${status} ${action}`);
      }
    }
  },

  'invite chỉ khi chưa có dòng; declined/withdrawn phải dùng reinvite'() {
    assert.equal(F.transitionFriendlyClub({ status: undefined, action: 'invite', side: 'host' }).to, 'invited');
    assert.equal(codeOf(() => F.transitionFriendlyClub({ status: 'declined', action: 'invite', side: 'host' })), 'FRIENDLY_TRANSITION_INVALID');
    assert.equal(codeOf(() => F.transitionFriendlyClub({ status: 'invited', action: 'reinvite', side: 'host' })), 'FRIENDLY_TRANSITION_INVALID');
  },

  'bảng transitions cho SQL chỉ gồm dòng rpc=action, mỗi (from, action) một dòng, sắp ổn định'() {
    const rows = F.friendlyActionTransitionRows();
    const expectedRows = EXPECTED.filter((r) => r[5] === 'action')
      .flatMap(([from, action, side, to, needsOpenWindow]) => from.map((f) => ({ from: f, action, side, to, needsOpenWindow })));
    assert.equal(rows.length, expectedRows.length);
    for (const row of expectedRows) assert.ok(rows.some((r) => JSON.stringify(r) === JSON.stringify(row)), JSON.stringify(row));
    assert.ok(!rows.some((r) => r.action === 'invite' || r.action === 'reinvite'));
    const sql = F.renderFriendlyTransitionsSql();
    assert.equal(sql.split('\n').length, rows.length);
    assert.match(sql, /\('invited', 'accept', 'guest', 'accepted', true\)/);
    assert.match(sql, /\('accepted', 'save_roster', 'guest', NULL, true\)/);
    assert.equal(F.renderFriendlyTransitionsSql(), sql, 'deterministic');
  },

  'registrationWindow: không hạn → mở'() {
    const w = F.registrationWindow({ settings: { organizer_mode: 'friendly' }, rosterLockStatus: 'open', now: '2026-10-01T00:00:00Z' });
    assert.deepEqual(w, { open: true, reason: null, deadline: null, lockedAt: null });
  },

  'registrationWindow: còn hạn → mở; qua hạn đúng mốc giây → đóng'() {
    const settings = { organizer_mode: 'friendly', friendly: { registrationDeadline: '2026-10-05T23:59:00+07:00', registrationLockedAt: null } };
    const before = F.registrationWindow({ settings, rosterLockStatus: 'open', now: new Date('2026-10-05T16:58:59.999Z') });
    assert.equal(before.open, true);
    assert.equal(before.deadline, '2026-10-05T23:59:00+07:00');
    const at = F.registrationWindow({ settings, rosterLockStatus: 'open', now: new Date('2026-10-05T16:59:00.000Z') });
    assert.deepEqual([at.open, at.reason], [false, 'DEADLINE_PASSED']);
    const after = F.registrationWindow({ settings, rosterLockStatus: 'open', now: Date.parse('2026-10-05T16:59:01Z') });
    assert.deepEqual([after.open, after.reason], [false, 'DEADLINE_PASSED']);
  },

  'registrationWindow: đã khoá → LOCKED (ưu tiên hơn qua hạn)'() {
    const settings = { organizer_mode: 'friendly', friendly: { registrationDeadline: '2026-01-01T00:00:00Z', registrationLockedAt: '2026-09-30T10:00:00Z' } };
    const w = F.registrationWindow({ settings, rosterLockStatus: 'open', now: '2026-10-01T00:00:00Z' });
    assert.deepEqual([w.open, w.reason, w.lockedAt], [false, 'LOCKED', '2026-09-30T10:00:00Z']);
  },

  'registrationWindow: đã chốt → FINALIZED (ưu tiên cao nhất); lock status lạ/thiếu → đóng'() {
    const settings = { organizer_mode: 'friendly', friendly: { registrationLockedAt: '2026-09-30T10:00:00Z' } };
    assert.equal(F.registrationWindow({ settings, rosterLockStatus: 'locked', now: '2026-10-01T00:00:00Z' }).reason, 'FINALIZED');
    assert.equal(F.registrationWindow({ settings: { organizer_mode: 'friendly' }, rosterLockStatus: undefined, now: '2026-10-01T00:00:00Z' }).open, false);
  },

  'registrationWindow: giải không phải friendly → đóng (fail closed)'() {
    const w = F.registrationWindow({ settings: { organizer_mode: 'internal' }, rosterLockStatus: 'open', now: '2026-10-01T00:00:00Z' });
    assert.deepEqual([w.open, w.reason], [false, 'NOT_FRIENDLY']);
  },

  'registrationWindow: hạn chót không parse được → đóng (fail closed)'() {
    const w = F.registrationWindow({ settings: { organizer_mode: 'friendly', friendly: { registrationDeadline: 'ngày mai' } }, rosterLockStatus: 'open', now: '2026-10-01T00:00:00Z' });
    assert.deepEqual([w.open, w.reason], [false, 'DEADLINE_PASSED']);
  },

  'validateClubRosterForSubmit: hợp lệ'() {
    const r = F.validateClubRosterForSubmit({ memberIds: ['1', '2', '3', '4'], pairs: [pair('a', 1, 2), pair('b', 3, 4)], unpairedRefs: [] }, { quota: 2, members: MEMBERS });
    assert.deepEqual(r, { ok: true, blockers: [] });
  },

  'validateClubRosterForSubmit: rỗng → FRIENDLY_ROSTER_EMPTY'() {
    const r = F.validateClubRosterForSubmit({ memberIds: [], pairs: [], unpairedRefs: [] }, { quota: 3, members: MEMBERS });
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), ['FRIENDLY_ROSTER_EMPTY']);
    assert.equal(F.validateClubRosterForSubmit(null, { quota: 3, members: MEMBERS }).ok, false);
  },

  'validateClubRosterForSubmit: lẻ người → FRIENDLY_ROSTER_UNPAIRED {count}'() {
    const r = F.validateClubRosterForSubmit({ memberIds: ['1', '2', '3'], pairs: [pair('a', 1, 2)], unpairedRefs: ['member:3'] }, { quota: 3, members: MEMBERS });
    assert.deepEqual(r.blockers, [{ code: 'FRIENDLY_ROSTER_UNPAIRED', params: { count: 1 } }]);
  },

  'validateClubRosterForSubmit: người chọn nhưng không nằm cặp nào (thiếu unpairedRefs) vẫn là lẻ'() {
    const r = F.validateClubRosterForSubmit({ memberIds: ['1', '2', '3'], pairs: [pair('a', 1, 2)] }, { quota: 3, members: MEMBERS });
    assert.deepEqual(codes(r), ['FRIENDLY_ROSTER_UNPAIRED']);
  },

  'validateClubRosterForSubmit: vượt hạn mức → FRIENDLY_QUOTA_EXCEEDED {quota, count}; quota null = không giới hạn'() {
    const roster = { memberIds: ['1', '2', '3', '4'], pairs: [pair('a', 1, 2), pair('b', 3, 4)], unpairedRefs: [] };
    const r = F.validateClubRosterForSubmit(roster, { quota: 1, members: MEMBERS });
    assert.deepEqual(r.blockers, [{ code: 'FRIENDLY_QUOTA_EXCEEDED', params: { quota: 1, count: 2 } }]);
    assert.equal(F.validateClubRosterForSubmit(roster, { quota: null, members: MEMBERS }).ok, true);
  },

  'validateClubRosterForSubmit: thiếu hồ sơ → FRIENDLY_ATHLETE_ID_MISSING {name}'() {
    const r = F.validateClubRosterForSubmit({ memberIds: ['1', '5'], pairs: [pair('a', 1, 5)], unpairedRefs: [] }, { quota: 3, members: MEMBERS });
    assert.deepEqual(r.blockers, [{ code: 'FRIENDLY_ATHLETE_ID_MISSING', params: { name: 'Én', memberId: '5' } }]);
  },

  'validateClubRosterForSubmit: ngoài CLB / ngừng hoạt động → FRIENDLY_MEMBER_OUTSIDE_CLUB'() {
    const outside = F.validateClubRosterForSubmit({ memberIds: ['1', '99'], pairs: [pair('a', 1, 99)], unpairedRefs: [] }, { quota: 3, members: MEMBERS });
    assert.deepEqual(codes(outside), ['FRIENDLY_MEMBER_OUTSIDE_CLUB']);
    assert.deepEqual(outside.blockers[0].params, { memberIds: ['99'] });
    const inactive = F.validateClubRosterForSubmit({ memberIds: ['1', '6'], pairs: [pair('a', 1, 6)], unpairedRefs: [] }, { quota: 3, members: MEMBERS });
    assert.deepEqual(codes(inactive), ['FRIENDLY_MEMBER_OUTSIDE_CLUB']);
    // members dạng object thường cũng nhận.
    const plain = F.validateClubRosterForSubmit({ memberIds: ['1', '2'], pairs: [pair('a', 1, 2)] }, { quota: 1, members: Object.fromEntries(MEMBERS) });
    assert.equal(plain.ok, true);
  },

  'validateClubRosterForSubmit: ref guest: → FRIENDLY_GUEST_NOT_ALLOWED (D38)'() {
    const r = F.validateClubRosterForSubmit({ memberIds: ['1'], pairs: [{ pairId: 'a', participantRefs: ['member:1', 'guest:g_abcdef12'] }], unpairedRefs: [] }, { quota: 3, members: MEMBERS });
    assert.ok(codes(r).includes('FRIENDLY_GUEST_NOT_ALLOWED'));
    assert.equal(r.ok, false);
  },

  'validateClubRosterForSubmit: một người ở hai cặp → chặn (không trùng người)'() {
    const r = F.validateClubRosterForSubmit({ memberIds: ['1', '2', '3'], pairs: [pair('a', 1, 2), pair('b', 2, 3)] }, { quota: 3, members: MEMBERS });
    assert.equal(r.ok, false);
    assert.ok(codes(r).includes('SETUP_PAYLOAD_INVALID'));
  },

  'lưu nháp: lẻ người / vượt hạn mức KHÔNG bị chặn ở domain'() {
    const odd = F.validateClubRosterForSave({ memberIds: ['1', '2', '3'], pairs: [pair('a', 1, 2)], unpairedRefs: ['member:3'] });
    assert.deepEqual(odd, { ok: true, blockers: [] });
    const many = { memberIds: ['1', '2', '3', '4'], pairs: [pair('a', 1, 2), pair('b', 3, 4)] };
    assert.equal(F.validateClubRosterForSave(many).ok, true, 'nháp không nhận quota');
    assert.equal(F.validateClubRosterForSave({ memberIds: [], pairs: [] }).ok, true, 'nháp rỗng lưu được');
  },

  'lưu nháp: vẫn chặn khách mời và shape vượt trần kỹ thuật'() {
    const guest = F.validateClubRosterForSave({ memberIds: ['1'], pairs: [{ pairId: 'a', participantRefs: ['member:1', 'guest:g_abcdef12'] }] });
    assert.deepEqual(codes(guest), ['FRIENDLY_GUEST_NOT_ALLOWED']);
    const big = { memberIds: Array.from({ length: 65 }, (_, i) => String(i + 1)), pairs: [] };
    assert.deepEqual(codes(F.validateClubRosterForSave(big)), ['SETUP_PAYLOAD_INVALID']);
  },

  'friendlyPairKey / parseFriendlyPairKey khứ hồi'() {
    const key = F.friendlyPairKey(881, 7, 'pair_x-1');
    assert.equal(key, 'c881.7.pair_x-1');
    assert.deepEqual(F.parseFriendlyPairKey(key), { tournamentClubId: '881', approvedVersion: '7', pairId: 'pair_x-1' });
    const long = 'p'.repeat(64);
    assert.equal(F.parseFriendlyPairKey(F.friendlyPairKey('12', '3', long)).pairId, long);
  },

  'parseFriendlyPairKey từ chối khóa lạ; friendlyPairKey từ chối đầu vào sai'() {
    for (const bad of ['', null, undefined, 'pair_1', 'c1.2', 'c.1.x', 'cX.1.p', 'c1.2.', 'c1.2.a.b', 'c1.2.' + 'p'.repeat(65), ' c1.2.p', 'c1.2.p ', 'C1.2.p', 'c1.2.p/q', 42]) {
      assert.equal(F.parseFriendlyPairKey(bad), null, String(bad));
    }
    for (const args of [[0, 1, 'p'], [1, 0, 'p'], [1, 1, ''], [1, 1, 'a.b'], [null, 1, 'p'], [1.5, 1, 'p']]) {
      assert.equal(codeOf(() => F.friendlyPairKey(...args)), 'FRIENDLY_PAIR_KEY_INVALID', JSON.stringify(args));
    }
  },

  'statusLabel theo phía xem; withdrawn: chủ nhà "Đã rút", khách "Đã huỷ mời"'() {
    const host = STATUSES.map((s) => F.statusLabel(s, 'host'));
    assert.deepEqual(host, ['Chờ phản hồi', 'Đang đăng ký', 'Từ chối', 'Chờ duyệt', 'Cần sửa', 'Đã duyệt', 'Đã rút']);
    assert.equal(F.statusLabel('withdrawn', 'guest'), 'Đã huỷ mời');
    assert.equal(F.statusLabel('invited', 'guest'), 'Chờ phản hồi');
  },

  'friendlyActionsFor: chỉ hành động hợp lệ theo trạng thái + cửa sổ'() {
    const open = { open: true, reason: null };
    const locked = { open: false, reason: 'LOCKED' };
    const finalized = { open: false, reason: 'FINALIZED' };
    assert.deepEqual(F.friendlyActionsFor({ status: 'invited', side: 'guest', window: open }), ['accept', 'decline']);
    assert.deepEqual(F.friendlyActionsFor({ status: 'invited', side: 'guest', window: locked }), []);
    assert.deepEqual(F.friendlyActionsFor({ status: 'roster_submitted', side: 'host', window: locked }), ['approve', 'remove', 'set_quota', 'rotate_link']);
    assert.deepEqual(F.friendlyActionsFor({ status: 'roster_submitted', side: 'host', window: finalized }), []);
  },

  'SERVER_OWNED_SETTINGS_KEYS + preserveServerOwnedSettings giữ khóa server'() {
    assert.deepEqual([...F.SERVER_OWNED_SETTINGS_KEYS], ['organizer_mode', 'friendly']);
    const current = { organizer_mode: 'friendly', friendly: { registrationDeadline: null, registrationLockedAt: '2026-09-30T10:00:00Z' }, poster_url: 'a' };
    const merged = F.preserveServerOwnedSettings(current, { poster_url: 'b', organizer_mode: 'internal', friendly: null, start_time: '07:30' });
    assert.deepEqual(merged, { poster_url: 'b', start_time: '07:30', organizer_mode: 'friendly', friendly: current.friendly });
    const internal = F.preserveServerOwnedSettings({ poster_url: 'a' }, { poster_url: 'b', organizer_mode: 'friendly' });
    assert.deepEqual(internal, { poster_url: 'b' }, 'khóa undefined bị bỏ, client không tự bật friendly');
  },

  'quota / ghi chú / hạn chót: kiểm như SQL'() {
    assert.deepEqual([null, 1, 32, 0, 33, 1.5, '3'].map(F.isValidQuota), [true, true, true, false, false, false, false]);
    assert.equal(F.validateReviewNote(' x ').ok, false);
    assert.equal(F.validateReviewNote('Thiếu người').ok, true);
    assert.equal(F.validateReviewNote('a'.repeat(301)).code, 'FRIENDLY_NOTE_REQUIRED');
    assert.deepEqual(F.parseDeadlineInput(null), { ok: true, deadline: null });
    assert.equal(F.parseDeadlineInput('2026-10-05T23:59:00+07:00').ok, true);
    assert.equal(F.parseDeadlineInput('2026-10-05T23:59:00Z').ok, true);
    for (const bad of ['2026-10-05T23:59:00', '2026-10-05', 'mai', 12345, '2026-13-45T00:00:00Z']) {
      assert.equal(F.parseDeadlineInput(bad).code, 'FRIENDLY_DEADLINE_INVALID', String(bad));
    }
  },

  'FRIENDLY_ERROR_STATUS có HTTP cho mọi mã §7'() {
    const expected = {
      CLUB_IS_HOST: 409, CLUB_NOT_FOUND: 404, CLUB_ALREADY_INVITED: 409, EXTERNAL_CLUB_NOT_SUPPORTED: 400,
      FRIENDLY_CLUB_LIMIT_REACHED: 409, RATE_LIMITED: 429, FRIENDLY_MODE_REQUIRED: 409, FRIENDLY_CLUB_NOT_FOUND: 404,
      FRIENDLY_CLUB_VERSION_CONFLICT: 409, FRIENDLY_TRANSITION_INVALID: 409, FRIENDLY_REGISTRATION_CLOSED: 409,
      FRIENDLY_ROSTER_EMPTY: 400, FRIENDLY_ROSTER_UNPAIRED: 400, FRIENDLY_QUOTA_EXCEEDED: 400, FRIENDLY_QUOTA_INVALID: 400,
      FRIENDLY_QUOTA_BELOW_ROSTER: 409, FRIENDLY_GUEST_NOT_ALLOWED: 400, FRIENDLY_MEMBER_OUTSIDE_CLUB: 400,
      FRIENDLY_ATHLETE_ID_MISSING: 400, FRIENDLY_NOTE_REQUIRED: 400, FRIENDLY_DEADLINE_INVALID: 400,
      FRIENDLY_INVITE_LINK_INVALID: 404, FRIENDLY_INVITE_WRONG_CLUB: 403, FRIENDLY_INVITE_LINK_EXPIRED: 410,
      UNAUTHENTICATED: 401, SETUP_PAYLOAD_INVALID: 400, SETUP_ACTION_RETIRED: 410,
      TOURNAMENT_NOT_FOUND: 404, GROUP_ADMIN_REQUIRED: 403,
    };
    for (const [code, status] of Object.entries(expected)) assert.equal(F.FRIENDLY_ERROR_STATUS[code], status, code);
  },

  'setupMessages có câu tiếng Việt cho mã mới, có tham số'() {
    const { messageFor } = lib('lib/tournament/setupMessages.js');
    assert.equal(messageFor('FRIENDLY_CLUB_LIMIT_REACHED', { max: 1 }).text,
      'Tài khoản CLB thường mời được tối đa 1 CLB khách cho mỗi giải. Mời nhiều CLB hơn là quyền lợi của gói trả phí (sắp ra mắt).');
    assert.equal(messageFor('FRIENDLY_QUOTA_EXCEEDED', { quota: 3 }).text, 'Vượt hạn mức 3 cặp.');
    assert.equal(messageFor('FRIENDLY_QUOTA_BELOW_ROSTER', { count: 2 }).text, 'CLB đã gửi 2 cặp; hạn mức không được nhỏ hơn.');
    assert.equal(messageFor('FRIENDLY_ATHLETE_ID_MISSING', { name: 'Én' }).text, 'Én chưa có hồ sơ thi đấu.');
    assert.equal(messageFor('UNAUTHENTICATED').text, 'Có lỗi xảy ra. Thử lại sau.', 'không đổi câu lỗi chung của setup');
    for (const code of Object.keys(F.FRIENDLY_ERROR_STATUS)) {
      // UNAUTHENTICATED: câu riêng của link mời ở friendlyInviteLink (không làm đổi câu lỗi lưu nháp setup).
      if (['TOURNAMENT_NOT_FOUND', 'GROUP_ADMIN_REQUIRED', 'UNAUTHENTICATED'].includes(code)) continue;
      assert.notEqual(messageFor(code).text, 'Có lỗi xảy ra. Thử lại sau.', code);
    }
  },
});
