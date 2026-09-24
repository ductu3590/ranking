'use strict';
// Epic 1 — Lát D1 §2: registry `double_elimination`, giới hạn 4–32 cặp, BO chung kết tổng.

const { assert, suite, lib } = require('../_harness');

const { FORMATS, FORMAT_ORDER, getFormat } = lib('lib/tournament/setupFormats.js');
const { validateStep } = lib('lib/tournament/setupStepRules.js');
const { messageFor } = lib('lib/tournament/setupMessages.js');

function draftWith(pairCount, formatKey = 'double_elimination', config = {}) {
  const memberIds = Array.from({ length: pairCount * 2 }, (_, i) => String(i + 1));
  return {
    draftVersion: 3,
    // courtCount: số sân chuyển sang Bước 3 (ADR-006 mục "Bổ sung sau E1").
    tournament: { name: 'IT', eventDate: '2026-10-12', courtCount: 2, organizerMode: 'internal' },
    participants: { memberIds, guests: [] },
    format: { entrantType: 'doubles', formatKey, config },
    pairs: Array.from({ length: pairCount }, (_, i) => ({ pairId: `pair_${i}`, participantRefs: [`member:${2 * i + 1}`, `member:${2 * i + 2}`], locked: false })),
    draw: { status: 'none' },
  };
}

const codes = (result) => result.blockers.map((b) => b.code);

suite('Epic 1 D1 — registry loại kép', {
  'có trong registry, sau knockout; min 4, max 32; BO chung kết tổng'() {
    const format = getFormat('double_elimination');
    assert.ok(format);
    assert.equal(format.label, 'Loại kép');
    assert.equal(format.supportsFinalBestOf, true);
    assert.deepEqual(FORMAT_ORDER.slice(-2), ['knockout', 'double_elimination']);
    assert.equal(format.minPairs(), 4);
    assert.equal(format.maxPairs(), 32);
    assert.deepEqual(format.validateConfig({ finalBestOf: 3 }), []);
    assert.equal(format.validateConfig({ finalBestOf: 2 })[0].code, 'FORMAT_CONFIG_INVALID');
    assert.equal(FORMATS.knockout.maxPairs, undefined, 'thể thức cũ không có giới hạn trên');
  },

  'bật, khớp danh sách SQL của migration 108 (test lát A khóa RPC = registry)'() {
    assert.equal(getFormat('double_elimination').enabled, true);
  },

  'Bước 3: > 32 cặp → PAIR_COUNT_ABOVE_MAXIMUM; < 4 → BELOW; 6–16 không cảnh báo'() {
    const enabled = () => true;
    assert.ok(codes(validateStep(draftWith(33), 3, { isFormatEnabled: enabled })).includes('PAIR_COUNT_ABOVE_MAXIMUM'));
    assert.ok(codes(validateStep(draftWith(3), 3, { isFormatEnabled: enabled })).includes('PAIR_COUNT_BELOW_MINIMUM'));
    const ok = validateStep(draftWith(8), 3, { isFormatEnabled: enabled });
    assert.deepEqual(codes(ok), []);
    assert.deepEqual(ok.warnings, []);
    assert.equal(validateStep(draftWith(20), 3, { isFormatEnabled: enabled }).warnings[0].code, 'PAIR_COUNT_OUTSIDE_RECOMMENDED');
    assert.match(messageFor('PAIR_COUNT_ABOVE_MAXIMUM', { max: 32, count: 33 }).text, /tối đa 32 cặp/);
    assert.match(messageFor('DOUBLE_ELIM_BYE').text, /nhánh thua được rút gọn/);
  },

  'knockout 40 cặp vẫn không bị chặn trên (hồi quy)'() {
    assert.equal(codes(validateStep(draftWith(40, 'knockout', { thirdPlaceEnabled: false }), 3)).includes('PAIR_COUNT_ABOVE_MAXIMUM'), false);
  },
});
