'use strict';
// Epic 3 F2 §3 — chế độ friendly, cặp hiệu lực, khóa cặp khách, readiness giao hữu, hợp đồng với migration 111.

const { assert, lib, suite } = require('../_harness');
const S = lib('lib/tournament/friendlySetup.js');
const { normalizeDraft, toSavePayload } = lib('lib/tournament/setupDraftV3.js');
const { friendlyPairKey, parseFriendlyPairKey } = lib('lib/tournament/friendlyClubs.js');
const { guestRow, hostDraft, GROUP_NAMES, HOST_GROUP } = require('./_f2Fixtures');

const codes = (list) => list.map((item) => item.code);

suite('f2 effective pairs', {
  'normalizeTournament giữ friendly; giá trị lạ / thiếu → internal'() {
    assert.equal(normalizeDraft({ tournament: { organizerMode: 'friendly' } }).tournament.organizerMode, 'friendly');
    assert.equal(normalizeDraft({ tournament: { organizerMode: 'internal' } }).tournament.organizerMode, 'internal');
    for (const bad of [undefined, null, '', 'FRIENDLY', 'mlp', 1, {}]) {
      assert.equal(normalizeDraft({ tournament: { organizerMode: bad } }).tournament.organizerMode, 'internal', String(bad));
    }
    assert.equal(normalizeDraft(null).tournament.organizerMode, 'internal');
    assert.equal(toSavePayload(hostDraft(2)).tournament.organizerMode, 'friendly', 'payload lưu mang chế độ');
  },

  'clubKeyOf: khóa khách → tc:<id>, còn lại → host'() {
    assert.equal(S.HOST_CLUB_KEY, 'host');
    assert.equal(S.clubKeyOf('c881.7.pair_x'), 'tc:881');
    assert.equal(S.clubKeyOf('h1'), 'host');
    assert.equal(S.clubKeyOf('pair_01'), 'host');
    assert.equal(S.clubKeyOf('c881.pair'), 'host');
  },

  'approvedGuestPairs: chỉ dòng approved, khóa c<id>.<ver>.<pairId>, thứ tự id rồi thứ tự cặp'() {
    const rows = [
      guestRow(902, 20, { version: 3, members: [31, 32, 33, 34] }),
      guestRow(881, 19, { version: 7, members: [21, 22, 23, 24, 25, 26] }),
      guestRow(890, 21, { status: 'roster_submitted', members: [41, 42] }),
      guestRow(891, 21, { status: 'declined' }),
    ];
    const pairs = S.approvedGuestPairs(rows, { groupNames: GROUP_NAMES });
    assert.deepEqual(pairs.map((p) => p.pairId), ['c881.7.pair_1', 'c881.7.pair_2', 'c881.7.pair_3', 'c902.3.pair_1', 'c902.3.pair_2']);
    assert.deepEqual(pairs[0], {
      pairId: 'c881.7.pair_1', sourcePairId: 'pair_1', participantRefs: ['member:21', 'member:22'],
      tournamentClubId: '881', clubKey: 'tc:881', clubName: 'CLB Test Responsive UI', memberNames: ['Khách 21', 'Khách 22'],
    });
    for (const pair of pairs) {
      assert.equal(pair.pairId, friendlyPairKey(pair.tournamentClubId, parseFriendlyPairKey(pair.pairId).approvedVersion, pair.sourcePairId));
    }
    assert.deepEqual(S.approvedGuestPairs([...rows].reverse(), { groupNames: GROUP_NAMES }), pairs, 'không phụ thuộc thứ tự dòng');
  },

  'approvedGuestPairs: approved mà thiếu version / dòng chủ nhà / CLB ngoài bị bỏ'() {
    const noVersion = { ...guestRow(881, 19, { members: [1, 2] }), roster_approved_version: null };
    const hostRow = { ...guestRow(880, HOST_GROUP, { members: [3, 4] }) };
    const external = guestRow(883, null, { members: [5, 6], external: 77 });
    assert.deepEqual(S.approvedGuestPairs([noVersion, hostRow, external]), []);
  },

  'duyệt lại → version đổi → khóa đổi'() {
    const before = S.approvedGuestPairs([guestRow(881, 19, { version: 7, members: [21, 22] })]);
    const after = S.approvedGuestPairs([guestRow(881, 19, { version: 9, members: [21, 22] })]);
    assert.notEqual(before[0].pairId, after[0].pairId);
    assert.equal(after[0].pairId, 'c881.9.pair_1');
  },

  'effectivePairs: không friendly = draft.pairs; friendly = chủ nhà (host) + khách đã duyệt'() {
    const draft = normalizeDraft(hostDraft(4));
    assert.equal(S.effectivePairs(draft, null), draft.pairs, 'cùng tham chiếu');
    assert.equal(S.effectivePairs(draft, undefined), draft.pairs);
    const friendly = S.buildFriendlyContext({ clubRows: [guestRow(881, 19, { members: [21, 22, 23, 24, 25, 26] })], groupNames: GROUP_NAMES, hostClubName: 'CLB Test 23.9.2026', entitlements: { maxGuestClubs: 1 } });
    const pairs = S.effectivePairs(draft, friendly);
    assert.equal(pairs.length, 7);
    assert.deepEqual(pairs.slice(0, 4).map((p) => [p.pairId, p.clubKey]), [['h1', 'host'], ['h2', 'host'], ['h3', 'host'], ['h4', 'host']]);
    assert.deepEqual(pairs.slice(0, 4).map((p) => p.participantRefs), draft.pairs.map((p) => p.participantRefs));
    assert.deepEqual(pairs.slice(4).map((p) => p.pairId), ['c881.7.pair_1', 'c881.7.pair_2', 'c881.7.pair_3']);
    assert.deepEqual(S.entryClubs(pairs), {
      h1: 'host', h2: 'host', h3: 'host', h4: 'host',
      'c881.7.pair_1': 'tc:881', 'c881.7.pair_2': 'tc:881', 'c881.7.pair_3': 'tc:881',
    });
    assert.equal(draft.pairs[0].clubKey, undefined, 'không sửa bản nháp');
  },

  'buildFriendlyContext: bỏ dòng chủ nhà, tên CLB theo tournamentClubId, hạn mức fail-closed = 1'() {
    const ctx = S.buildFriendlyContext({
      clubRows: [guestRow(880, HOST_GROUP), guestRow(881, 19, { members: [21, 22] })],
      groupNames: GROUP_NAMES,
      hostClubName: 'CLB Test 23.9.2026',
    });
    assert.deepEqual(ctx.clubRows.map((r) => r.id), [881]);
    assert.deepEqual(ctx.clubNames, { host: 'CLB Test 23.9.2026', 'tc:881': 'CLB Test Responsive UI' });
    assert.equal(ctx.maxGuestClubs, 1);
    assert.equal(ctx.approvedPairs.length, 1);
    assert.deepEqual(ctx.athletes, []);
    assert.equal(S.buildFriendlyContext({ clubRows: [], entitlements: { maxGuestClubs: 2 } }).maxGuestClubs, 2);
    assert.equal(S.buildFriendlyContext({ clubRows: [], entitlements: { maxGuestClubs: 99 } }).maxGuestClubs, 31);
  },

  'friendlyReadiness: còn CLB chưa duyệt → FRIENDLY_CLUB_NOT_READY {clubs}'() {
    const rows = [
      { ...guestRow(881, 19, { members: [21, 22] }), clubName: 'CLB Test Responsive UI' },
      { ...guestRow(882, 20, { status: 'roster_submitted', members: [31, 32] }), clubName: 'CLB Khách B' },
      { ...guestRow(883, 21, { status: 'invited' }), clubName: 'CLB Khách C' },
    ];
    const out = S.friendlyReadiness({ clubRows: rows, hostPairCount: 3, maxGuestClubs: 5 });
    assert.deepEqual(codes(out.blockers), ['FRIENDLY_CLUB_NOT_READY']);
    assert.deepEqual(out.blockers[0].params, { clubs: ['CLB Khách B', 'CLB Khách C'] });
    const noVersion = { ...guestRow(884, 19, { members: [1, 2] }), roster_approved_version: null, clubName: 'X' };
    assert.deepEqual(codes(S.friendlyReadiness({ clubRows: [noVersion], hostPairCount: 3, maxGuestClubs: 1 }).blockers), ['FRIENDLY_CLUB_NOT_READY', 'FRIENDLY_CLUBS_TOO_FEW']);
  },

  'friendlyReadiness: quá hạn mức (maxGuestClubs 1 chặn, 2 cho qua)'() {
    const rows = [guestRow(881, 19, { members: [21, 22, 23, 24] }), guestRow(882, 20, { members: [31, 32, 33, 34] })];
    const one = S.friendlyReadiness({ clubRows: rows, hostPairCount: 3, maxGuestClubs: 1 });
    assert.deepEqual(codes(one.blockers), ['FRIENDLY_CLUB_LIMIT_REACHED']);
    assert.deepEqual(one.blockers[0].params, { max: 1 });
    assert.deepEqual(S.friendlyReadiness({ clubRows: rows, hostPairCount: 3, maxGuestClubs: 2 }).blockers, []);
    assert.deepEqual(codes(S.friendlyReadiness({ clubRows: rows, hostPairCount: 3 }).blockers), ['FRIENDLY_CLUB_LIMIT_REACHED'], 'thiếu hạn mức → 1 (fail closed)');
    const declined = [guestRow(881, 19, { members: [21, 22] }), guestRow(882, 20, { status: 'declined' }), guestRow(883, 21, { status: 'withdrawn' })];
    assert.deepEqual(S.friendlyReadiness({ clubRows: declined, hostPairCount: 3, maxGuestClubs: 1 }).blockers, [], 'từ chối/rút không chiếm suất');
  },

  'friendlyReadiness: < 2 CLB có cặp → FRIENDLY_CLUBS_TOO_FEW'() {
    assert.deepEqual(codes(S.friendlyReadiness({ clubRows: [], hostPairCount: 4, maxGuestClubs: 1 }).blockers), ['FRIENDLY_CLUBS_TOO_FEW']);
    assert.deepEqual(codes(S.friendlyReadiness({ clubRows: [guestRow(881, 19, { status: 'withdrawn', members: [1, 2] })], hostPairCount: 4, maxGuestClubs: 1 }).blockers), ['FRIENDLY_CLUBS_TOO_FEW']);
    assert.deepEqual(codes(S.friendlyReadiness({ clubRows: [guestRow(881, 19, { members: [1, 2] })], hostPairCount: 0, maxGuestClubs: 1 }).blockers), ['FRIENDLY_CLUBS_TOO_FEW']);
    assert.deepEqual(S.friendlyReadiness({ clubRows: [guestRow(881, 19, { members: [1, 2] })], hostPairCount: 1, maxGuestClubs: 1 }).blockers, []);
  },

  'friendlyReadiness: trùng VĐV giữa hai CLB → FRIENDLY_ATHLETE_DUPLICATE {name}; cùng CLB không tính'() {
    const rows = [guestRow(881, 19, { members: [21, 22] })];
    const athletes = [
      { clubKey: 'host', memberId: '3', athleteId: '9001', name: 'Nguyễn Văn A' },
      { clubKey: 'tc:881', memberId: '21', athleteId: '9001', name: 'Nguyễn Văn A' },
      { clubKey: 'host', memberId: '4', athleteId: '9002', name: 'Trần B' },
      { clubKey: 'host', memberId: '4', athleteId: '9002', name: 'Trần B' },
    ];
    const out = S.friendlyReadiness({ clubRows: rows, hostPairCount: 2, maxGuestClubs: 1, athletes });
    assert.deepEqual(out.blockers, [{ code: 'FRIENDLY_ATHLETE_DUPLICATE', params: { name: 'Nguyễn Văn A', athleteId: '9001' } }]);
  },

  'friendlyReadiness: mirror 111 — CLB ngoài, khách mời trong roster, vượt quota'() {
    const external = { ...guestRow(885, null, { members: [1, 2], external: 77 }), clubName: 'CLB ngoài' };
    assert.ok(codes(S.friendlyReadiness({ clubRows: [external], hostPairCount: 2, maxGuestClubs: 1 }).blockers).includes('EXTERNAL_CLUB_NOT_SUPPORTED'));
    const withGuest = guestRow(881, 19, { members: [21, 22] });
    withGuest.roster_submitted.pairs[0].participantRefs = ['member:21', 'guest:g_abcdef12'];
    assert.ok(codes(S.friendlyReadiness({ clubRows: [withGuest], hostPairCount: 2, maxGuestClubs: 1 }).blockers).includes('FRIENDLY_GUEST_NOT_ALLOWED'));
    const overQuota = guestRow(881, 19, { members: [21, 22, 23, 24], quota: 1 });
    const out = S.friendlyReadiness({ clubRows: [overQuota], hostPairCount: 2, maxGuestClubs: 1 });
    assert.deepEqual(out.blockers.find((b) => b.code === 'FRIENDLY_QUOTA_EXCEEDED').params, { quota: 1, count: 2, club: 'CLB #881' });
  },

  'friendlyReadiness: cảnh báo FRIENDLY_CLUB_DECLINED (không chặn)'() {
    const rows = [
      guestRow(881, 19, { members: [21, 22] }),
      { ...guestRow(882, 20, { status: 'declined' }), clubName: 'CLB Khách B' },
      { ...guestRow(883, 21, { status: 'withdrawn' }), clubName: 'CLB Khách C' },
    ];
    const out = S.friendlyReadiness({ clubRows: rows, hostPairCount: 2, maxGuestClubs: 1 });
    assert.deepEqual(out.blockers, []);
    assert.deepEqual(out.warnings, [{ code: 'FRIENDLY_CLUB_DECLINED', params: { clubs: ['CLB Khách B', 'CLB Khách C'] } }]);
  },

  'finalizePlanPayload: nội bộ = đúng p_plan cũ; friendly thêm friendly.maxGuestClubs'() {
    const plan = { formatKey: 'group_knockout', fingerprint: 'f'.repeat(64), matches: [] };
    const draft = normalizeDraft(hostDraft(2));
    const internal = S.finalizePlanPayload({ plan, pairs: draft.pairs, friendly: null });
    assert.deepEqual(internal, { ...plan, pairs: draft.pairs.map((pair) => ({ pairId: pair.pairId, refs: pair.participantRefs })) });
    assert.equal('friendly' in internal, false);
    const friendly = S.buildFriendlyContext({ clubRows: [guestRow(881, 19, { members: [21, 22] })], entitlements: { maxGuestClubs: 1 } });
    const pairs = S.effectivePairs(draft, friendly);
    const payload = S.finalizePlanPayload({ plan, pairs, friendly });
    assert.deepEqual(payload.friendly, { maxGuestClubs: 1 });
    assert.deepEqual(payload.pairs.map((p) => p.pairId), ['h1', 'h2', 'c881.7.pair_1']);
    assert.deepEqual(Object.keys(payload.pairs[2]).sort(), ['pairId', 'refs']);
    assert.throws(() => S.finalizePlanPayload({ plan, pairs, friendly: { ...friendly, maxGuestClubs: 0 } }), (e) => e.code === 'FINALIZE_PLAN_INVALID');
  },

  'hợp đồng SQL 111: hằng đối chiếu cho test khoá của api-dev'() {
    const C = S.FRIENDLY_FINALIZE_SQL_CONTRACT;
    assert.deepEqual(C.readyStatuses, ['approved', 'declined', 'withdrawn']);
    assert.deepEqual(C.maxGuestClubsRange, [1, 31]);
    assert.equal(C.planFriendlyPath, "p_plan->'friendly'->>'maxGuestClubs'");
    assert.equal(C.pairKeyPattern, '^c([0-9]+)\\.([0-9]+)\\.([A-Za-z0-9_-]{1,64})$');
    assert.ok(new RegExp(C.pairKeyPattern).test('c881.7.pair_1'));
    assert.equal(C.guestRefPattern, '^member:[1-9][0-9]*$');
    for (const code of ['FRIENDLY_HOST_GUEST_NOT_ALLOWED', 'FRIENDLY_CLUB_NOT_READY', 'FRIENDLY_CLUB_LIMIT_REACHED', 'FRIENDLY_ROSTER_CHANGED',
      'FRIENDLY_CLUBS_TOO_FEW', 'FRIENDLY_ATHLETE_DUPLICATE', 'EXTERNAL_CLUB_NOT_SUPPORTED', 'FRIENDLY_GUEST_NOT_ALLOWED', 'FRIENDLY_QUOTA_EXCEEDED',
      'MEMBER_NOT_ACTIVE_IN_GROUP', 'ATHLETE_IDENTITY_MISSING', 'PAIRING_INVALID', 'FINALIZE_PLAN_INVALID', 'FINALIZE_DRAFT_INVALID']) {
      assert.ok(C.raiseCodes.includes(code), code);
    }
    assert.ok(C.differencesFrom108.length >= 6);
    assert.ok(C.differencesFrom108.some((line) => line.includes('FRIENDLY_HOST_GUEST_NOT_ALLOWED')), 'D49 nằm trong danh sách khác biệt');
    // Mã F2 → HTTP cho RPC_CODES / route (spec F2 §8).
    assert.equal(S.FRIENDLY_SETUP_CODES.ORGANIZER_MODE_LOCKED.status, 409);
    assert.equal(S.FRIENDLY_SETUP_CODES.FRIENDLY_ROSTER_CHANGED.status, 409);
    assert.equal(S.FRIENDLY_SETUP_CODES.FRIENDLY_MODE_REQUIRED.status, 404);
    assert.equal(S.FRIENDLY_SETUP_CODES.FRIENDLY_CLUB_SPREAD_LIMITED.severity, 'warning');
  },

  'setupMessages có câu cho mọi mã F2'() {
    const { messageFor } = lib('lib/tournament/setupMessages.js');
    for (const code of Object.keys(S.FRIENDLY_SETUP_CODES)) {
      assert.notEqual(messageFor(code).text, 'Có lỗi xảy ra. Thử lại sau.', code);
    }
    assert.equal(messageFor('FRIENDLY_CLUB_NOT_READY', { clubs: ['CLB A', 'CLB B'] }).text,
      'Còn CLB chưa được duyệt danh sách: CLB A, CLB B. Duyệt, yêu cầu sửa hoặc rút CLB trước khi bốc thăm.');
    assert.equal(messageFor('FRIENDLY_ATHLETE_DUPLICATE', { name: 'Nguyễn Văn A' }).text, 'Nguyễn Văn A có tên trong danh sách của hai CLB.');
    assert.equal(messageFor('FRIENDLY_CLUB_SPREAD_LIMITED', { club: 'CLB 59', count: 4, groupCount: 2, unit: 'group' }).text,
      'CLB 59 có 4 cặp cho 2 bảng: có cặp cùng CLB gặp nhau sớm.');
    assert.equal(messageFor('FRIENDLY_CLUB_SPREAD_LIMITED', { club: 'CLB 59', count: 4, groupCount: 2, unit: 'half' }).text,
      'CLB 59 có 4 cặp cho 2 nửa nhánh: có cặp cùng CLB gặp nhau sớm.');
    assert.equal(messageFor('FRIENDLY_HOST_GUEST_NOT_ALLOWED').step, 2);
  },
});
