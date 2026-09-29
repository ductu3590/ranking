'use strict';
// Epic 4 · C3 — domain setup giải cộng đồng: khóa cặp, participantRef, ngữ cảnh, luật bước 2/3/4 (spec lat-c3 §3).
// Ghi chú lệch spec (đã ghi ở evidence.md): khóa cặp là r<regId>.<accountA>.<accountB> thay vì r<regId>.<version>, vì
// tournament_registrations.version tăng cả khi admin đổi cờ phí — sẽ làm bốc thăm hết hạn oan.

const { assert, lib, suite } = require('../_harness');

const cs = lib('lib/tournament/communitySetup.js');
const { validateStep, computeCompletedThrough } = lib('lib/tournament/setupStepRules.js');
const { normalizeDraft } = lib('lib/tournament/setupDraftV3.js');
const { messageFor } = lib('lib/tournament/setupMessages.js');
const { planInputSignature } = lib('lib/tournament/setupPlans/common.js');

function reg(id, a, b, extra = {}) {
  return {
    id, status: 'approved', merged_into: null, player_account_id: a, fee_confirmed_at: null, needs_partner: false,
    members: [
      { seat: 1, player_account_id: a, full_name: `VĐV ${a}`, self_declared_phr: 3, gender: 'male' },
      { seat: 2, player_account_id: b, full_name: `VĐV ${b}`, self_declared_phr: 2.8, gender: 'female' },
    ],
    ...extra,
  };
}

function eightPairs() {
  return Array.from({ length: 8 }, (_, index) => reg(index + 1, 100 + index * 2, 101 + index * 2));
}

function draftWithFormat(overrides = {}) {
  return normalizeDraft({
    draftVersion: 3,
    tournament: { name: 'Giải cộng đồng', eventDate: '2099-11-15', startTime: '07:30', courtCount: 2, organizerMode: 'internal' },
    format: { formatKey: 'round_robin', config: {} },
    ...overrides,
  });
}

suite('C3 khóa cặp và participantRef', {
  'khóa cặp = r<đơn>.<tài khoản 1>.<tài khoản 2>': () => {
    assert.equal(cs.communityPairKey(12, 5, 9), 'r12.5.9');
    assert.deepEqual(cs.parseCommunityPairKey('r12.5.9'), { registrationId: '12', accountIds: ['5', '9'] });
  },
  'từ chối khóa sai dạng': () => {
    for (const bad of ['r12.5', 'r0.1.2', 'r12.5.9.1', 'c1.2.3', 'r12.a.9', '', null, undefined, 'r12.5.5x']) {
      assert.equal(cs.parseCommunityPairKey(bad), null, `phải từ chối ${JSON.stringify(bad)}`);
    }
    assert.throws(() => cs.communityPairKey(0, 1, 2));
    assert.throws(() => cs.communityPairKey(1, 2, 2), 'hai ghế cùng tài khoản');
  },
  'participantRef = player:<id>': () => {
    assert.equal(cs.playerRef(7), 'player:7');
    assert.deepEqual(cs.parsePlayerRef('player:7'), { accountId: '7' });
    assert.equal(cs.parsePlayerRef('member:7'), null);
    assert.equal(cs.parsePlayerRef('player:0'), null);
  },
});

suite('C3 buildCommunityContext', {
  'chỉ đơn approved đủ hai ghế khác tài khoản được thành cặp, theo id tăng dần': () => {
    const ctx = cs.buildCommunityContext({
      registrations: [
        reg(9, 21, 22), reg(3, 11, 12),
        reg(4, 13, 14, { status: 'submitted' }),
        reg(5, 15, 16, { status: 'awaiting_partner' }),
        reg(6, 17, 18, { status: 'rejected' }),
        reg(7, 19, 20, { merged_into: 3 }),
        { ...reg(8, 23, 24), members: [reg(8, 23, 24).members[0]] },
        { ...reg(10, 25, 26), members: [{ seat: 1, player_account_id: 25, full_name: 'a' }, { seat: 2, player_account_id: 25, full_name: 'a' }] },
      ],
    });
    assert.deepEqual(ctx.approvedPairs.map((pair) => pair.pairId), ['r3.11.12', 'r9.21.22']);
    assert.deepEqual(ctx.approvedPairs[0].participantRefs, ['player:11', 'player:12']);
    assert.deepEqual(ctx.approvedPairs[0].memberNames, ['VĐV 11', 'VĐV 12']);
  },
  'đếm đơn còn lại và phí chưa thu': () => {
    const ctx = cs.buildCommunityContext({
      registrations: [
        reg(1, 11, 12), reg(2, 13, 14, { fee_confirmed_at: '2026-09-29T00:00:00Z' }),
        reg(3, 15, 16, { status: 'submitted' }), reg(4, 17, 18, { status: 'submitted' }),
        reg(5, 19, 20, { status: 'awaiting_partner' }),
        reg(6, 21, 22, { status: 'withdrawn' }),
      ],
      entryFee: 150000,
    });
    assert.equal(ctx.pendingCount, 2);
    assert.equal(ctx.awaitingPartnerCount, 1);
    assert.equal(ctx.feeUnconfirmedCount, 1, 'chỉ tính cặp đã duyệt chưa thu');
    assert.equal(ctx.approvedPairs.length, 2);
  },
  'miễn phí thì không đếm phí chưa thu': () => {
    const ctx = cs.buildCommunityContext({ registrations: [reg(1, 11, 12)], entryFee: 0 });
    assert.equal(ctx.feeUnconfirmedCount, 0);
  },
  'đổi cờ phí KHÔNG đổi khóa cặp (không làm bốc thăm hết hạn)': () => {
    const before = cs.buildCommunityContext({ registrations: [reg(1, 11, 12)] });
    const after = cs.buildCommunityContext({ registrations: [reg(1, 11, 12, { fee_confirmed_at: '2026-09-29T00:00:00Z', version: 9 })] });
    assert.deepEqual(before.approvedPairs.map((p) => p.pairId), after.approvedPairs.map((p) => p.pairId));
  },
  'đổi thành viên (ghép hộ / ghép lại) ĐỔI khóa cặp': () => {
    const before = cs.buildCommunityContext({ registrations: [reg(1, 11, 12)] });
    const after = cs.buildCommunityContext({ registrations: [reg(1, 11, 30)] });
    assert.notEqual(before.approvedPairs[0].pairId, after.approvedPairs[0].pairId);
  },
  'view công khai cho admin không chứa SĐT, ngày sinh, tài khoản': () => {
    const ctx = cs.buildCommunityContext({ registrations: [reg(1, 11, 12)], entryFee: 1000 });
    const view = cs.projectCommunityView(ctx);
    const text = JSON.stringify(view);
    assert.ok(!/phone|dob|birth|player_account|accountId|player:/i.test(text), 'không lộ định danh: ' + text);
    assert.equal(view.approvedPairs[0].pairId, 'r1.11.12');
    assert.deepEqual(view.approvedPairs[0].members.map((m) => m.name), ['VĐV 11', 'VĐV 12']);
    assert.equal(view.approvedPairs[0].feeConfirmed, false);
    assert.equal(view.counts.approved, 1);
  },
});

suite('C3 luật bước với ctx.community', {
  'Bước 2: dưới 2 cặp đã duyệt → COMMUNITY_TOO_FEW_PAIRS': () => {
    const community = cs.buildCommunityContext({ registrations: [reg(1, 11, 12)] });
    const result = validateStep(draftWithFormat(), 2, { community });
    assert.ok(!result.ok);
    assert.deepEqual(result.blockers.map((b) => b.code), ['COMMUNITY_TOO_FEW_PAIRS']);
    assert.notEqual(result.blockers.map((b) => b.code)[0], 'ROSTER_EMPTY');
  },
  'Bước 2: đủ 2 cặp → hợp lệ, đơn chờ duyệt / đang tìm bạn / phí chưa thu chỉ là cảnh báo': () => {
    const community = cs.buildCommunityContext({
      registrations: [reg(1, 11, 12), reg(2, 13, 14), reg(3, 15, 16, { status: 'submitted' }), reg(4, 17, 18, { status: 'awaiting_partner' })],
      entryFee: 100000,
    });
    const result = validateStep(draftWithFormat(), 2, { community });
    assert.ok(result.ok, JSON.stringify(result.blockers));
    const codes = result.warnings.map((w) => w.code).sort();
    assert.deepEqual(codes, ['COMMUNITY_AWAITING_PARTNER', 'COMMUNITY_FEE_UNCONFIRMED', 'COMMUNITY_PENDING_REGISTRATIONS']);
    assert.equal(result.warnings.find((w) => w.code === 'COMMUNITY_FEE_UNCONFIRMED').params.count, 2);
  },
  'Bước 2: chọn thành viên CLB hoặc khách mời bị chặn': () => {
    const community = cs.buildCommunityContext({ registrations: [reg(1, 11, 12), reg(2, 13, 14)] });
    const withMember = validateStep(draftWithFormat({ participants: { memberIds: ['5'], guests: [] } }), 2, { community });
    assert.deepEqual(withMember.blockers.map((b) => b.code), ['COMMUNITY_MEMBER_PICK_NOT_ALLOWED']);
    const withGuest = validateStep(draftWithFormat({ participants: { memberIds: [], guests: [{ clientRef: 'guest-ref-001', displayName: 'Khách A' }] } }), 2, { community });
    assert.deepEqual(withGuest.blockers.map((b) => b.code), ['COMMUNITY_MEMBER_PICK_NOT_ALLOWED']);
  },
  'Bước 3: đếm cặp theo cặp đã duyệt, không đòi ghép cặp thủ công, không có UNPAIRED_MEMBER': () => {
    const community = cs.buildCommunityContext({ registrations: eightPairs() });
    const result = validateStep(draftWithFormat(), 3, { community });
    assert.ok(result.ok, JSON.stringify(result.blockers));
    assert.ok(!result.blockers.some((b) => b.code === 'UNPAIRED_MEMBER' || b.code === 'PAIR_MEMBER_COUNT_INVALID'));
  },
  'Bước 3: thể thức cần nhiều cặp hơn số đã duyệt → PAIR_COUNT_BELOW_MINIMUM': () => {
    const community = cs.buildCommunityContext({ registrations: [reg(1, 11, 12), reg(2, 13, 14)] });
    const draft = draftWithFormat({ format: { formatKey: 'group_knockout', config: { groupCount: 2, qualifiersPerGroup: 2 } } });
    const result = validateStep(draft, 3, { community });
    assert.ok(result.blockers.some((b) => b.code === 'PAIR_COUNT_BELOW_MINIMUM'), JSON.stringify(result.blockers));
  },
  'Bước 3 vẫn đòi số sân': () => {
    const community = cs.buildCommunityContext({ registrations: eightPairs() });
    const draft = draftWithFormat();
    draft.tournament.courtCount = null;
    const result = validateStep(draft, 3, { community });
    assert.ok(result.blockers.some((b) => b.code === 'COURT_COUNT_INVALID'));
  },
  'Bước 4: chữ ký bốc thăm theo cặp đã duyệt → đổi cặp thì DRAW_STALE': () => {
    const community = cs.buildCommunityContext({ registrations: eightPairs() });
    const pairIds = community.approvedPairs.map((pair) => pair.pairId);
    const signature = planInputSignature({ formatKey: 'round_robin', config: {}, pairIds });
    const draft = draftWithFormat({ draw: { status: 'draft', seed: 's', previewFingerprint: 'f'.repeat(64), plan: { inputSignature: signature, formatKey: 'round_robin', groups: [{ entryIds: pairIds }] } } });
    assert.deepEqual(validateStep(draft, 4, { community }).blockers, []);
    const changed = cs.buildCommunityContext({ registrations: [...eightPairs().slice(0, 7), reg(8, 500, 501)] });
    const stale = validateStep(draft, 4, { community: changed });
    assert.deepEqual(stale.blockers.map((b) => b.code), ['DRAW_STALE']);
  },
  'completedThrough = 3 khi đủ điều kiện': () => {
    const community = cs.buildCommunityContext({ registrations: eightPairs() });
    assert.equal(computeCompletedThrough(draftWithFormat(), { community }), 3);
  },
});

suite('C3 hồi quy: không có ctx.community thì luật bước y như cũ', {
  'giải nội bộ vẫn đòi ROSTER_EMPTY ở Bước 2': () => {
    const result = validateStep(draftWithFormat(), 2, {});
    assert.deepEqual(result.blockers.map((b) => b.code), ['ROSTER_EMPTY']);
  },
  'mã cộng đồng có câu tiếng Việt và đúng bước': () => {
    for (const [code, step] of [['COMMUNITY_TOO_FEW_PAIRS', 2], ['COMMUNITY_MEMBER_PICK_NOT_ALLOWED', 2], ['COMMUNITY_PENDING_REGISTRATIONS', 2],
      ['COMMUNITY_AWAITING_PARTNER', 2], ['COMMUNITY_FEE_UNCONFIRMED', 2], ['COMMUNITY_ROSTER_CHANGED', 4]]) {
      const message = messageFor(code, { count: 2, min: 2 });
      assert.equal(message.step, step, code);
      assert.ok(/[À-ỹ]/.test(message.text), `${code} phải có tiếng Việt: ${message.text}`);
    }
  },
});
