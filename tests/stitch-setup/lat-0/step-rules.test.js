'use strict';

const { assert, lib, suite } = require('../_harness');
const { validateStep, computeCompletedThrough, allowedStep } = lib('lib/tournament/setupStepRules.js');
const { computeSetupReadiness } = lib('lib/tournament/setupReadiness.js');
const { messageFor } = lib('lib/tournament/setupMessages.js');

const codes = (result) => result.blockers.map((item) => item.code);
const warnCodes = (result) => result.warnings.map((item) => item.code);
const enabledAll = { isFormatEnabled: () => true };
// Cả ba thể thức đã bật (Lát C); giả lập registry còn khóa knockout để kiểm nhánh "chưa bật".
const knockoutLocked = { isFormatEnabled: (key) => key !== 'knockout' };

function info(overrides = {}) {
  return { name: 'Giải tháng 10', eventDate: '2026-10-12', startTime: '07:30', courtCount: 4, ...overrides };
}

function members(ids, extra = {}) {
  return new Map(ids.map((id) => [String(id), { name: `TV ${id}`, active: true, hasAthlete: true, ...(extra[id] || {}) }]));
}

function pairedDraft(pairCount, format = { formatKey: 'round_robin', config: {} }) {
  const memberIds = Array.from({ length: pairCount * 2 }, (_, i) => String(i + 1));
  const pairs = Array.from({ length: pairCount }, (_, i) => ({ pairId: `p${i + 1}`, participantRefs: [`member:${2 * i + 1}`, `member:${2 * i + 2}`] }));
  return { draftVersion: 3, tournament: info(), participants: { memberIds, guests: [] }, pairs, format };
}

suite('step rules', {
  // Số sân chuyển sang Bước 3 (yêu cầu người dùng 2026-09-24 — ADR-006 mục "Bổ sung sau E1").
  'bước 1: thiếu tên/ngày/giờ đều chặn; số sân không còn ở bước 1'() {
    const result = validateStep({ tournament: { name: '', eventDate: '', startTime: '', courtCount: null } }, 1);
    assert.deepEqual(codes(result).sort(), ['EVENT_DATE_REQUIRED', 'START_TIME_REQUIRED', 'TOURNAMENT_NAME_REQUIRED']);
  },

  'bước 1: ngày không tồn tại, áp phích http đều chặn'() {
    const result = validateStep({ tournament: info({ eventDate: '2026-02-30', courtCount: 21, posterUrl: 'http://x.vn/a.jpg' }) }, 1);
    assert.deepEqual(codes(result).sort(), ['EVENT_DATE_REQUIRED', 'POSTER_URL_INVALID']);
  },

  'bước 3: chưa chọn số sân hoặc quá 20 sân → COURT_COUNT_INVALID'() {
    const missing = pairedDraft(4);
    missing.tournament = info({ courtCount: null });
    assert.ok(codes(validateStep(missing, 3, enabledAll)).includes('COURT_COUNT_INVALID'));
    const tooMany = pairedDraft(4);
    tooMany.tournament = info({ courtCount: 21 });
    assert.ok(codes(validateStep(tooMany, 3, enabledAll)).includes('COURT_COUNT_INVALID'));
    assert.equal(codes(validateStep(pairedDraft(4), 3, enabledAll)).includes('COURT_COUNT_INVALID'), false);
    assert.equal(messageFor('COURT_COUNT_INVALID').step, 3);
  },

  'bước 1: ngày đã qua chỉ cảnh báo'() {
    const result = validateStep({ tournament: info({ eventDate: '2026-01-01' }) }, 1, { today: '2026-09-23' });
    assert.equal(result.ok, true);
    assert.deepEqual(warnCodes(result), ['EVENT_DATE_IN_PAST']);
  },

  'bước 2: dưới 2 người → ROSTER_EMPTY; khách tính vào tổng'() {
    assert.deepEqual(codes(validateStep({ participants: { memberIds: ['1'], guests: [] } }, 2)), ['ROSTER_EMPTY']);
    assert.equal(validateStep({ participants: { memberIds: ['1'], guests: [{ clientRef: 'g_12345678', displayName: 'Khách A' }] } }, 2).ok, true);
  },

  'bước 2: member ngoài CLB, thiếu hồ sơ, ngừng hoạt động'() {
    const ctx = { members: members([1, 2], { 2: { hasAthlete: false, active: false } }) };
    const result = validateStep({ participants: { memberIds: ['1', '2', '3'], guests: [] } }, 2, ctx);
    assert.deepEqual(codes(result).sort(), ['ATHLETE_ID_MISSING', 'MEMBER_OUTSIDE_GROUP']);
    assert.deepEqual(warnCodes(result), ['INACTIVE_MEMBER_SELECTED']);
  },

  'bước 2: tên khách quá ngắn chặn; trùng tên thành viên chỉ cảnh báo'() {
    const ctx = { members: members([1]) };
    const result = validateStep({ participants: { memberIds: ['1'], guests: [{ clientRef: 'g_12345678', displayName: 'TV 1' }, { clientRef: 'g_87654321', displayName: 'A' }] } }, 2, ctx);
    assert.deepEqual(codes(result), ['GUEST_NAME_INVALID']);
    assert.deepEqual(warnCodes(result), ['GUEST_NAME_MATCHES_MEMBER']);
  },

  'bước 3: thể thức chưa bật → FORMAT_NOT_AVAILABLE'() {
    const result = validateStep(pairedDraft(4, { formatKey: 'knockout', config: {} }), 3, knockoutLocked);
    assert.ok(codes(result).includes('FORMAT_NOT_AVAILABLE'));
  },

  'bước 3: chưa chọn thể thức → FORMAT_REQUIRED'() {
    assert.ok(codes(validateStep(pairedDraft(4, {}), 3, enabledAll)).includes('FORMAT_REQUIRED'));
  },

  'bước 3: người lẻ → UNPAIRED_MEMBER với số người'() {
    const draft = pairedDraft(3);
    draft.participants.memberIds.push('99');
    const result = validateStep(draft, 3, enabledAll);
    const unpaired = result.blockers.find((item) => item.code === 'UNPAIRED_MEMBER');
    assert.equal(unpaired.params.count, 1);
    assert.match(messageFor('UNPAIRED_MEMBER', unpaired.params).text, /Còn 1 người chưa ghép cặp/);
  },

  'bước 3: dưới tối thiểu chặn, ngoài khuyến nghị chỉ cảnh báo'() {
    assert.ok(codes(validateStep(pairedDraft(2), 3, enabledAll)).includes('PAIR_COUNT_BELOW_MINIMUM'));
    const big = validateStep(pairedDraft(8), 3, enabledAll);
    assert.equal(big.ok, true);
    assert.deepEqual(warnCodes(big), ['PAIR_COUNT_OUTSIDE_RECOMMENDED']);
  },

  'bước 3: vòng bảng tối thiểu theo tổ hợp; 2×1 không hợp lệ'() {
    const gk = (n, config) => validateStep(pairedDraft(n, { formatKey: 'group_knockout', config }), 3, enabledAll);
    assert.ok(codes(gk(5, { groupCount: 2, qualifiersPerGroup: 2 })).includes('PAIR_COUNT_BELOW_MINIMUM'));
    assert.equal(gk(6, { groupCount: 2, qualifiersPerGroup: 2 }).ok, true);
    assert.ok(codes(gk(8, { groupCount: 3, qualifiersPerGroup: 2 })).includes('PAIR_COUNT_BELOW_MINIMUM'));
    assert.ok(codes(gk(8, { groupCount: 2, qualifiersPerGroup: 1 })).includes('FORMAT_CONFIG_INVALID'));
    assert.ok(codes(gk(8, { groupCount: 2, qualifiersPerGroup: 2, finalBestOf: 2 })).includes('FORMAT_CONFIG_INVALID'));
  },

  'completedThrough đếm bước liên tiếp và hạ khi bước trước hỏng'() {
    const draft = pairedDraft(4, { formatKey: 'knockout', config: {} });
    assert.equal(computeCompletedThrough(draft, enabledAll), 3);
    assert.equal(computeCompletedThrough(draft, knockoutLocked), 2, 'thể thức chưa bật dừng ở bước 2');
    assert.equal(computeCompletedThrough(draft), 3, 'registry thật: loại trực tiếp đã bật');
    draft.tournament = info({ name: '' });
    assert.equal(computeCompletedThrough(draft, enabledAll), 0);
  },

  'allowedStep không cho vượt quá completedThrough + 1'() {
    assert.equal(allowedStep(4, 1), 2);
    assert.equal(allowedStep(2, 3), 2);
    assert.equal(allowedStep(9, 3), 4);
    assert.equal(allowedStep(0, 0), 1);
  },

  'readiness gắn câu tiếng Việt, không lộ mã trong message'() {
    const readiness = computeSetupReadiness({ tournament: info({ name: '' }) });
    const first = readiness.byStep[1].blockers[0];
    assert.equal(first.code, 'TOURNAMENT_NAME_REQUIRED');
    assert.equal(first.message, 'Nhập tên giải.');
    for (const item of [...readiness.blockers, ...readiness.warnings]) {
      assert.equal(/[A-Z]{3,}_[A-Z_]+/.test(item.message), false, `message ${item.code} không chứa mã thô`);
    }
    assert.equal(readiness.readyToFinalize, false);
  },
});
