'use strict';

const crypto = require('node:crypto');
const { assert, lib, read, suite } = require('../_harness');
const { buildSetupPlan } = lib('lib/tournament/setupPlans/index.js');
const { validateStep } = lib('lib/tournament/setupStepRules.js');
const { estimateSchedule } = lib('lib/tournament/setupSchedule.js');
const { FORMATS } = lib('lib/tournament/setupFormats.js');

const pairIds = (n) => Array.from({ length: n }, (_, i) => `pair_${String(i + 1).padStart(2, '0')}`);
const plan = (n, seed = 'seed-rr') => buildSetupPlan({ formatKey: 'round_robin', config: {}, pairIds: pairIds(n), seed, divisionId: '9' });

function pairsFacing(p) {
  return p.matches.map((m) => [m.entryAId, m.entryBId].sort().join('~'));
}

// SHA-256 của roundRobin.js tại base 29e33c6 (file đóng băng, xem skill tournament-setup-invariants §1).
const FROZEN_ROUND_ROBIN_SHA256 = '76b03fa91060026f9d175a38e4eeb02ae901257f232203f62976764196851706';

suite('lát B — plan vòng tròn tính điểm', {
  'số trận và số lượt: 3→3/3, 4→6/3, 6→15/5, 7→21/7'() {
    for (const [n, total, rounds] of [[3, 3, 3], [4, 6, 3], [6, 15, 5], [7, 21, 7]]) {
      const p = plan(n);
      assert.equal(p.counts.total, total, `${n} cặp: số trận`);
      assert.equal(p.matches.length, total);
      assert.equal(p.rounds, rounds, `${n} cặp: số lượt`);
      assert.equal(p.counts.knockoutMatches, 0);
    }
  },

  'mọi cặp gặp nhau đúng một lần, mỗi cặp đá n−1 trận'() {
    const p = plan(6);
    const faced = pairsFacing(p);
    assert.equal(new Set(faced).size, faced.length, 'không cặp nào gặp nhau hai lần');
    for (const id of pairIds(6)) {
      assert.equal(p.matches.filter((m) => m.entryAId === id || m.entryBId === id).length, 5);
    }
  },

  'một lượt không có cặp đá hai trận'() {
    const p = plan(7);
    for (let round = 1; round <= p.rounds; round += 1) {
      const ids = p.matches.filter((m) => m.round === round).flatMap((m) => [m.entryAId, m.entryBId]);
      assert.equal(new Set(ids).size, ids.length, `lượt ${round}`);
    }
  },

  'một stage, không progression, matchKey GROUP-A-n, tất cả BO1'() {
    const p = plan(5);
    assert.equal(p.stages.length, 1);
    assert.equal(p.stages[0].scheduleFormat, 'round_robin');
    assert.equal(p.stages[0].config.match_scoring, undefined);
    assert.deepEqual(p.progressions, []);
    assert.deepEqual(p.groups.map((g) => g.label), ['A']);
    assert.ok(p.matches.every((m, i) => m.matchKey === `GROUP-A-${i + 1}` && m.stagePlanKey === 'group-stage'));
    assert.ok(estimateSchedule(p, { courtCount: 2, startTime: '08:00' }).rows.every((r) => r.bestOf === 1));
  },

  'cùng seed → cùng fingerprint; đổi seed đổi thứ tự lượt nhưng giữ số trận'() {
    const a = plan(6, 's1');
    const b = buildSetupPlan({ formatKey: 'round_robin', config: {}, pairIds: pairIds(6).reverse(), seed: 's1', divisionId: '9' });
    assert.equal(a.fingerprint, b.fingerprint);
    const c = plan(6, 's2');
    assert.notEqual(a.fingerprint, c.fingerprint);
    assert.equal(c.counts.total, 15);
  },

  'dưới 3 cặp bị chặn; 7 cặp chỉ cảnh báo'() {
    assert.throws(() => plan(2), (e) => e.code === 'PAIR_COUNT_BELOW_MINIMUM' && e.params.min === 3);
    const memberIds = Array.from({ length: 14 }, (_, i) => String(i + 1));
    const pairs = pairIds(7).map((pairId, i) => ({ pairId, participantRefs: [`member:${2 * i + 1}`, `member:${2 * i + 2}`] }));
    // courtCount: số sân chuyển sang Bước 3 (ADR-006 mục "Bổ sung sau E1").
    const result = validateStep({ draftVersion: 3, tournament: { courtCount: 3 }, participants: { memberIds, guests: [] }, pairs, format: { formatKey: 'round_robin', config: {} } }, 3);
    assert.equal(result.ok, true);
    assert.deepEqual(result.warnings.map((w) => w.code), ['PAIR_COUNT_OUTSIDE_RECOMMENDED']);
  },

  'đổi cặp sau khi bốc → cần bốc lại (không có "cập nhật xem trước")'() {
    const p = plan(4);
    const memberIds = Array.from({ length: 8 }, (_, i) => String(i + 1));
    const pairs = pairIds(4).map((pairId, i) => ({ pairId, participantRefs: [`member:${2 * i + 1}`, `member:${2 * i + 2}`] }));
    const draft = { draftVersion: 3, participants: { memberIds, guests: [] }, pairs, format: { formatKey: 'round_robin', config: {} }, draw: { status: 'draft', seed: 'seed-rr', previewFingerprint: p.fingerprint, plan: p } };
    assert.equal(validateStep(draft, 4).ok, true);
    const changed = validateStep({ ...draft, pairs: [...pairs.slice(0, 3), { pairId: 'pair_new', participantRefs: ['member:7', 'member:8'] }] }, 4);
    assert.equal(changed.blockers[0].code, 'DRAW_STALE');
    assert.equal(changed.blockers[0].params.groupsChanged, true);
  },

  'registry: vòng tròn mở, không có BO chung kết; engine đóng băng không bị sửa'() {
    assert.equal(FORMATS.round_robin.enabled, true);
    assert.equal(FORMATS.round_robin.supportsFinalBestOf, false);
    const hash = crypto.createHash('sha256').update(read('lib/tournament/engines/roundRobin.js').replace(/\r\n/g, '\n')).digest('hex');
    assert.equal(hash, FROZEN_ROUND_ROBIN_SHA256, 'lib/tournament/engines/roundRobin.js là file đóng băng');
  },
});
