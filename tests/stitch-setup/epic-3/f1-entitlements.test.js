'use strict';
// Epic 3 F1 §8 — điểm quyết định quyền lợi D46 (hạn mức CLB khách mỗi giải).

const { assert, lib, suite, read } = require('../_harness');
const E = lib('lib/tournament/friendlyEntitlements.js');

const STATUSES = ['invited', 'accepted', 'declined', 'roster_submitted', 'changes_requested', 'approved', 'withdrawn'];
const guest = (status, id = 1) => ({ id, group_id: 59, club_id: 100 + id, invitation_status: status });

suite('f1 entitlements', {
  'hằng số: free = 1, trần kỹ thuật 31, gói mặc định free'() {
    assert.deepEqual({ ...E.PLAN_GUEST_CLUB_LIMITS }, { free: 1 });
    assert.equal(Object.isFrozen(E.PLAN_GUEST_CLUB_LIMITS), true);
    assert.equal(E.CORE_MAX_GUEST_CLUBS, 31);
    assert.equal(E.DEFAULT_PLAN, 'free');
    assert.equal(E.resolveClubPlan({ groupId: 59 }), 'free');
  },

  'maxGuestClubsPerTournament() = 1'() {
    assert.equal(E.maxGuestClubsPerTournament(), 1);
    assert.equal(E.maxGuestClubsPerTournament({}), 1);
    assert.equal(E.maxGuestClubsPerTournament({ plan: 'free' }), 1);
  },

  'gói lạ → 1 (fail closed), kể cả khóa prototype'() {
    for (const plan of ['club_plus', 'enterprise', '', null, '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      assert.equal(E.maxGuestClubsPerTournament({ plan }), 1, String(plan));
    }
  },

  'giá trị kẹp 1..31 (clampGuestClubLimit)'() {
    assert.deepEqual([0, -5, 1, 2, 31, 32, 1000, 2.7, NaN, null, undefined, '5', Infinity].map(E.clampGuestClubLimit),
      [1, 1, 1, 2, 31, 31, 31, 2, 1, 1, 1, 5, 31]);
  },

  'isValidMaxGuestClubs khớp kiểm tham số RPC (số nguyên 1–31)'() {
    assert.deepEqual([1, 31, 0, 32, 1.5, null, '1'].map(E.isValidMaxGuestClubs), [true, true, false, false, false, false, false]);
  },

  'resolveFriendlyEntitlements trả Promise (async, chỗ cắm gói sau này)'() {
    assert.ok(E.resolveFriendlyEntitlements({ db: null, groupId: 59 }) instanceof Promise);
  },

  'countsTowardGuestLimit đúng 7 trạng thái'() {
    assert.deepEqual(STATUSES.map(E.countsTowardGuestLimit), [true, true, false, true, true, true, false]);
    assert.equal(E.countsTowardGuestLimit('bogus'), true, 'trạng thái lạ vẫn chiếm suất (fail closed)');
  },

  'guestClubLimitView: 0 dòng → chưa đạt'() {
    assert.deepEqual(E.guestClubLimitView({ maxGuestClubs: 1, rows: [] }), { max: 1, used: 0, remaining: 1, reached: false, upgradeHint: null });
  },

  'guestClubLimitView: 1 invited → đạt + upgradeHint'() {
    assert.deepEqual(E.guestClubLimitView({ maxGuestClubs: 1, rows: [guest('invited')] }), {
      max: 1, used: 1, remaining: 0, reached: true,
      upgradeHint: 'Mời nhiều CLB hơn là quyền lợi của gói trả phí (sắp ra mắt).',
    });
  },

  'guestClubLimitView: 1 declined / withdrawn → chưa đạt (suất được trả lại)'() {
    assert.equal(E.guestClubLimitView({ maxGuestClubs: 1, rows: [guest('declined')] }).reached, false);
    assert.equal(E.guestClubLimitView({ maxGuestClubs: 1, rows: [guest('withdrawn'), guest('declined', 2)] }).used, 0);
  },

  'guestClubLimitView: maxGuestClubs 2 (ca core ≥ 3 CLB) → 1 dòng chưa đạt, 2 dòng đạt'() {
    assert.equal(E.guestClubLimitView({ maxGuestClubs: 2, rows: [guest('approved')] }).reached, false);
    assert.equal(E.guestClubLimitView({ maxGuestClubs: 2, rows: [guest('approved'), guest('invited', 2)] }).reached, true);
  },

  'guestClubLimitView: dòng chủ nhà (club_id = group_id) không tính; max thiếu/sai → 1'() {
    const host = { id: 9, group_id: 59, club_id: 59, invitation_status: 'approved' };
    assert.equal(E.guestClubLimitView({ maxGuestClubs: 1, rows: [host] }).used, 0);
    assert.equal(E.guestClubLimitView({ rows: [] }).max, 1);
    assert.equal(E.guestClubLimitView({ maxGuestClubs: 99, rows: null }).max, 31);
    assert.equal(E.guestClubLimitView({ maxGuestClubs: 1, rows: [{ status: 'invited' }] }).used, 1, 'nhận cả khóa status');
  },

  'không có biến môi trường / cờ runtime nâng hạn mức'() {
    const src = read('lib/tournament/friendlyEntitlements.js');
    assert.doesNotMatch(src, /process\.env/);
    assert.doesNotMatch(src, /require\(/, 'thuần, không phụ thuộc');
  },
});

// Harness chạy đồng bộ: kiểm giá trị async riêng, đỏ thì đặt exitCode.
E.resolveFriendlyEntitlements({ db: null, groupId: 59 }).then((value) => {
  assert.deepEqual(value, { plan: 'free', maxGuestClubs: 1, upgradeAvailable: false });
  console.log('ok   f1 entitlements (async): 1/1');
}).catch((error) => {
  console.error(`RED  f1 entitlements (async): resolveFriendlyEntitlements\n    ${error.message}`);
  process.exitCode = 1;
});
