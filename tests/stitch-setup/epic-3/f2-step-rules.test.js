'use strict';
// Epic 3 F2 §3.4 — luật bước với ctx.friendly (cặp hiệu lực, blocker CLB, D49, DRAW_STALE khi duyệt lại)
// + khoá hồi quy: ctx.friendly vắng → kết quả bằng đúng trước Epic 3.

const crypto = require('node:crypto');
const { assert, lib, suite } = require('../_harness');
const { validateStep, computeCompletedThrough } = lib('lib/tournament/setupStepRules.js');
const { computeSetupReadiness } = lib('lib/tournament/setupReadiness.js');
const { buildSetupPlan } = lib('lib/tournament/setupPlans/index.js');
const { setupContext, participantNames, firstBlocker } = lib('lib/tournament/setupServer.js');
const S = lib('lib/tournament/friendlySetup.js');
const { guestRow, hostDraft, GROUP_NAMES } = require('./_f2Fixtures');
const { drafts, CONTEXTS } = require('./_f2Baseline');

const codes = (result) => result.blockers.map((item) => item.code);
const GK = { formatKey: 'group_knockout', config: { groupCount: 2, qualifiersPerGroup: 2 } };

// Băm trên code TRƯỚC F2 (HEAD b4b3652), một băm cho mỗi ctx trong _f2Baseline.CONTEXTS.
const PRE_F2_HASHES = ['aa40751aa0b180cc', 'f644e1c68e00625f', 'b8f759b61647f92b'];

function friendlyCtx(rows, extra = {}) {
  return {
    friendly: S.buildFriendlyContext({ clubRows: rows, groupNames: GROUP_NAMES, hostClubName: 'CLB Test 23.9.2026', entitlements: { maxGuestClubs: 1 }, ...extra }),
  };
}

const G1_ROWS = () => [guestRow(881, 19, { version: 7, members: [21, 22, 23, 24, 25, 26] })];

function drawnFriendly(draft, ctx, seed = 'seed-f') {
  const pairs = S.effectivePairs(draft, ctx.friendly);
  const plan = buildSetupPlan({ formatKey: draft.format.formatKey, config: draft.format.config, pairIds: pairs.map((p) => p.pairId), seed, divisionId: '9', entryClubs: S.entryClubs(pairs) });
  return { ...draft, draw: { status: 'draft', seed, previewFingerprint: plan.fingerprint, plan } };
}

suite('f2 step rules', {
  'hồi quy: ctx.friendly vắng → validateStep/readiness bằng đúng trước Epic 3 (fixture Lát 0/A/B/C)'() {
    const actual = CONTEXTS.map((ctx) => {
      const snap = drafts().map((d) => ({ steps: [1, 2, 3, 4].map((s) => validateStep(d, s, ctx)), done: computeCompletedThrough(d, ctx), ready: computeSetupReadiness(d, ctx) }));
      return crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex').slice(0, 16);
    });
    assert.deepEqual(actual, PRE_F2_HASHES);
  },

  'Bước 3: đếm cặp hiệu lực (4 + 3 = 7 qua minPairs 6 của 2x2)'() {
    const draft = hostDraft(4, GK);
    assert.deepEqual(validateStep(draft, 3).blockers.find((b) => b.code === 'PAIR_COUNT_BELOW_MINIMUM').params, { min: 6, count: 4 }, 'không friendly: chỉ 4 cặp');
    const result = validateStep(draft, 3, friendlyCtx(G1_ROWS()));
    assert.equal(result.ok, true, JSON.stringify(result.blockers));
    assert.deepEqual(result.warnings, []);
  },

  'Bước 3: cặp chủ nhà vẫn kiểm như cũ (người lẻ, cặp sai), trên draft.pairs'() {
    const draft = hostDraft(4, GK);
    draft.participants.memberIds.push('9');
    const result = validateStep(draft, 3, friendlyCtx(G1_ROWS()));
    assert.deepEqual(codes(result), ['UNPAIRED_MEMBER']);
    assert.deepEqual(result.blockers[0].params, { count: 1, refs: ['member:9'] });
  },

  'Bước 3: còn roster_submitted → FRIENDLY_CLUB_NOT_READY (bước 3, trường clubs) kèm tên'() {
    const rows = [guestRow(881, 19, { status: 'roster_submitted', members: [21, 22, 23, 24, 25, 26] })];
    const result = validateStep(hostDraft(4, GK), 3, friendlyCtx(rows));
    const blocker = result.blockers.find((b) => b.code === 'FRIENDLY_CLUB_NOT_READY');
    assert.deepEqual(blocker, { code: 'FRIENDLY_CLUB_NOT_READY', step: 3, severity: 'blocker', field: 'clubs', params: { clubs: ['CLB Test Responsive UI'] } });
    assert.ok(codes(result).includes('PAIR_COUNT_BELOW_MINIMUM'), 'cặp chưa duyệt không tính');
    assert.ok(codes(result).includes('FRIENDLY_CLUBS_TOO_FEW'));
  },

  'Bước 3: hạn mức, trùng VĐV, cảnh báo từ chối'() {
    const rows = [guestRow(881, 19, { members: [21, 22, 23, 24] }), guestRow(882, 20, { members: [31, 32] }), guestRow(883, 21, { status: 'declined' })];
    const athletes = [{ clubKey: 'host', memberId: '1', athleteId: '5', name: 'An' }, { clubKey: 'tc:882', memberId: '31', athleteId: '5', name: 'An' }];
    const result = validateStep(hostDraft(3, GK), 3, friendlyCtx(rows, { athletes }));
    assert.deepEqual(codes(result), ['FRIENDLY_CLUB_LIMIT_REACHED', 'FRIENDLY_ATHLETE_DUPLICATE']);
    assert.deepEqual(result.warnings.map((w) => [w.code, w.step, w.field, w.params]), [['FRIENDLY_CLUB_DECLINED', 3, 'clubs', { clubs: ['CLB Khách C'] }]]);
    const core = validateStep(hostDraft(3, GK), 3, friendlyCtx(rows, { entitlements: { maxGuestClubs: 2 } }));
    assert.equal(core.ok, true, JSON.stringify(core.blockers));
  },

  'Bước 2 (D49): giải friendly có khách mời → FRIENDLY_HOST_GUEST_NOT_ALLOWED; nội bộ có khách vẫn qua'() {
    const draft = hostDraft(2, GK);
    draft.participants.guests = [{ clientRef: 'g_abcdef12', displayName: 'Khách Một' }];
    const friendly = validateStep(draft, 2, friendlyCtx(G1_ROWS()));
    assert.deepEqual(friendly.blockers, [{ code: 'FRIENDLY_HOST_GUEST_NOT_ALLOWED', step: 2, severity: 'blocker', field: 'guests', params: { count: 1 } }]);
    assert.equal(validateStep(draft, 2).ok, true, 'không có ctx.friendly (nội bộ) → khách mời hợp lệ');
    assert.equal(computeCompletedThrough(draft, friendlyCtx(G1_ROWS())), 1, 'không sang được Bước 3');
  },

  'Bước 4: bốc bằng cặp hiệu lực + entryClubs → hợp lệ; duyệt lại (version đổi) → DRAW_STALE groupsChanged'() {
    const ctx = friendlyCtx(G1_ROWS());
    const draft = drawnFriendly(hostDraft(4, GK), ctx);
    const ok = validateStep(draft, 4, ctx);
    assert.equal(ok.ok, true, JSON.stringify(ok.blockers));
    assert.deepEqual(codes(validateStep(draft, 4)), ['DRAW_STALE'], 'thiếu ctx.friendly: chữ ký chỉ có cặp chủ nhà → lệch');
    const reapproved = friendlyCtx([guestRow(881, 19, { version: 9, members: [21, 22, 23, 24, 25, 26] })]);
    const stale = validateStep(draft, 4, reapproved);
    assert.deepEqual(codes(stale), ['DRAW_STALE']);
    assert.equal(stale.blockers[0].params.groupsChanged, true);
    const withdrawn = validateStep(draft, 4, friendlyCtx([guestRow(881, 19, { status: 'withdrawn' })]));
    assert.deepEqual(codes(withdrawn), ['DRAW_STALE']);
  },

  'Bước 4: cảnh báo FRIENDLY_CLUB_SPREAD_LIMITED mỗi CLB, có tên + số cặp + số bảng'() {
    const ctx = friendlyCtx(G1_ROWS());
    const draft = drawnFriendly(hostDraft(4, GK), ctx);
    const warnings = validateStep(draft, 4, ctx).warnings;
    assert.deepEqual(warnings.map((w) => w.code), ['GROUP_SIZE_IMBALANCE', 'FRIENDLY_CLUB_SPREAD_LIMITED', 'FRIENDLY_CLUB_SPREAD_LIMITED']);
    assert.deepEqual(warnings.slice(1).map((w) => w.params), [
      { club: 'CLB Test 23.9.2026', clubKey: 'host', count: 4, groupCount: 2, unit: 'group' },
      { club: 'CLB Test Responsive UI', clubKey: 'tc:881', count: 3, groupCount: 2, unit: 'group' },
    ]);
    const { messageFor } = lib('lib/tournament/setupMessages.js');
    assert.equal(computeSetupReadiness(draft, ctx).byStep[4].warnings[1].message, messageFor('FRIENDLY_CLUB_SPREAD_LIMITED', warnings[1].params).text);
  },

  'readiness G1: completedThrough 3, readyToFinalize; firstBlocker(…, 4) = null'() {
    const ctx = friendlyCtx(G1_ROWS());
    const draft = drawnFriendly(hostDraft(4, GK), ctx);
    const readiness = computeSetupReadiness(draft, ctx);
    assert.equal(readiness.completedThrough, 3);
    assert.equal(readiness.readyToFinalize, true);
    assert.equal(firstBlocker(draft, ctx, 4), null);
    assert.equal(firstBlocker(draft, friendlyCtx([guestRow(881, 19, { status: 'roster_submitted', members: [21, 22] })]), 3).code, 'FRIENDLY_CLUB_NOT_READY');
  },

  'nghiệm thu G1 đầu-cuối: 59 = 4 + khách 3 → 7 cặp, 12 trận (6 liên CLB + 3 nội bộ + 3 loại), 13 có hạng ba; preview = finalize'() {
    const run = (config) => {
      const ctx = friendlyCtx(G1_ROWS());
      const draft = hostDraft(4, { formatKey: 'group_knockout', config });
      const pairs = S.effectivePairs(draft, ctx.friendly);
      const clubs = S.entryClubs(pairs);
      const plan = buildSetupPlan({ formatKey: 'group_knockout', config, pairIds: pairs.map((p) => p.pairId), seed: 'g1', divisionId: '9', entryClubs: clubs });
      return { plan, clubs, pairs, ctx };
    };
    const { plan, clubs, pairs, ctx } = run(GK.config);
    assert.equal(pairs.length, 7);
    assert.equal(plan.counts.total, 12);
    const group = plan.matches.filter((m) => m.stageKind === 'group');
    assert.equal(group.length, 9);
    assert.equal(group.filter((m) => clubs[m.entryAId] !== clubs[m.entryBId]).length, 6);
    assert.deepEqual(plan.matches.filter((m) => m.stageKind === 'knockout').map((m) => m.matchKey), ['SF1', 'SF2', 'F']);
    assert.equal(run({ ...GK.config, thirdPlaceEnabled: true }).plan.counts.total, 13);
    assert.equal(run(GK.config).plan.fingerprint, plan.fingerprint, 'preview và finalize dựng lại từ dữ liệu mới → cùng fingerprint');
    const payload = S.finalizePlanPayload({ plan, pairs, friendly: ctx.friendly });
    assert.equal(payload.pairs.length, 7);
    assert.deepEqual(payload.friendly, { maxGuestClubs: 1 });
  },

  'nghiệm thu G-core3 (3/2/2, hạn mức truyền 2): 12 trận; cùng dữ liệu hạn mức 1 → FRIENDLY_CLUB_LIMIT_REACHED'() {
    const rows = [guestRow(881, 19, { members: [21, 22, 23, 24] }), guestRow(882, 20, { members: [31, 32, 33, 34] })];
    const ctx = friendlyCtx(rows, { entitlements: { maxGuestClubs: 2 } });
    const draft = drawnFriendly(hostDraft(3, GK), ctx, 'core3');
    assert.equal(computeSetupReadiness(draft, ctx).readyToFinalize, true);
    assert.equal(draft.draw.plan.counts.total, 12);
    assert.equal(firstBlocker(draft, friendlyCtx(rows), 4).code, 'FRIENDLY_CLUB_LIMIT_REACHED');
  },

  'hồi quy ca 14 người nội bộ: 12 trận, 13 có hạng ba; 15 người bị chặn ở Bước 3'() {
    const draft = drawnFriendly(hostDraft(7, GK), {}, 'seed-1');
    assert.equal(draft.draw.plan.counts.total, 12);
    assert.equal(validateStep(draft, 4).ok, true);
    assert.equal(drawnFriendly(hostDraft(7, { formatKey: 'group_knockout', config: { ...GK.config, thirdPlaceEnabled: true } }), {}, 'seed-1').draw.plan.counts.total, 13);
    const odd = hostDraft(7, GK);
    odd.participants.memberIds.push('15');
    assert.ok(codes(validateStep(odd, 3)).includes('UNPAIRED_MEMBER'));
  },

  'setupContext nhận friendly tùy chọn; participantNames thêm tên cặp khách'() {
    const fakeDb = {
      from: () => ({
        select: () => ({
          eq: () => ({ in: async () => ({ data: [{ id: 1, full_name: 'Chủ Một', is_active: true }], error: null }) }),
          in: async () => ({ data: [{ legacy_club_member_id: 1 }], error: null }),
        }),
      }),
    };
    const draft = hostDraft(1, GK);
    const { friendly } = friendlyCtx(G1_ROWS());
    return Promise.all([setupContext(fakeDb, 59, draft), setupContext(fakeDb, 59, draft, { friendly })]).then(([plain, withFriendly]) => {
      assert.equal('friendly' in plain, false, 'nội bộ: ctx không có khóa friendly');
      assert.equal(withFriendly.friendly, friendly);
      const names = participantNames(draft, withFriendly);
      assert.equal(names.get('member:1'), 'Chủ Một');
      assert.equal(names.get('member:21'), 'Khách 21');
      assert.equal(participantNames(draft, plain).has('member:21'), false);
    }).catch((error) => { process.exitCode = 1; console.error('  ✗ setupContext async\n    ' + error.message); });
  },
});
