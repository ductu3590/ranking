'use strict';

const { assert, lib, read, suite } = require('../_harness');
const { buildSetupPlan } = lib('lib/tournament/setupPlans/index.js');
const { validateStep } = lib('lib/tournament/setupStepRules.js');
const { estimateSchedule } = lib('lib/tournament/setupSchedule.js');
const { resolveMatchScoring } = lib('lib/tournament/rules/roundScoring.js');
const { messageFor } = lib('lib/tournament/setupMessages.js');
const knockoutEngine = lib('lib/tournament/engines/knockout.js');

const pairIds = (n) => Array.from({ length: n }, (_, i) => `pair_${String(i + 1).padStart(2, '0')}`);
const plan = (n, config = {}, seed = 'seed-ko') => buildSetupPlan({ formatKey: 'knockout', config, pairIds: pairIds(n), seed, divisionId: '9' });
const incoming = (p, key, side) => p.progressions.filter((e) => e.targetMatchKey === key && e.targetSlot === side);

function pairedDraft(n, format) {
  const memberIds = Array.from({ length: n * 2 }, (_, i) => String(i + 1));
  const pairs = pairIds(n).map((pairId, i) => ({ pairId, participantRefs: [`member:${2 * i + 1}`, `member:${2 * i + 2}`] }));
  return { draftVersion: 3, participants: { memberIds, guests: [] }, pairs, format };
}

suite('lát C — plan loại trực tiếp', {
  'bảng spec §4: 4/6/8/12/32 cặp → số bye, số trận (+hạng ba), số vòng'() {
    for (const [n, byes, total, rounds] of [[4, 0, 3, 2], [6, 2, 5, 3], [8, 0, 7, 3], [12, 4, 11, 4], [32, 0, 31, 5]]) {
      const p = plan(n);
      assert.equal(p.byeEntryIds.length, byes, `${n} cặp: bye`);
      assert.equal(p.counts.total, total, `${n} cặp: số trận`);
      assert.equal(p.rounds, rounds, `${n} cặp: số vòng`);
      assert.equal(plan(n, { thirdPlaceEnabled: true }).counts.total, total + 1, `${n} cặp: + hạng ba`);
    }
  },

  'matchKey: F, SF1–2, QF1–4, vòng sớm R<vòng>-<ô>; BRONZE chỉ khi bật'() {
    assert.deepEqual(plan(4).matches.map((m) => m.matchKey), ['SF1', 'SF2', 'F']);
    assert.deepEqual(plan(8, { thirdPlaceEnabled: true }).matches.map((m) => m.matchKey), ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'BRONZE', 'F']);
    const big = plan(32).matches.map((m) => m.matchKey);
    assert.ok(big.includes('R1-16') && big.includes('R2-8') && big.includes('QF4'));
    assert.equal(plan(8).matches.some((m) => m.matchKey === 'BRONZE'), false);
  },

  'không có trận một bên, không entrant giả; mỗi cặp vào nhánh đúng một lần'() {
    for (const n of [4, 5, 6, 7, 9, 12, 13, 32]) {
      const p = plan(n, { thirdPlaceEnabled: true });
      const placed = p.matches.flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean);
      assert.equal(placed.length, n, `${n} cặp`);
      assert.equal(new Set(placed).size, n);
      for (const m of p.matches) {
        for (const side of ['a', 'b']) {
          const entry = side === 'a' ? m.entryAId : m.entryBId;
          assert.equal((entry ? 1 : 0) + incoming(p, m.matchKey, side).length, 1, `${n} cặp · ${m.matchKey}.${side}`);
        }
      }
      assert.ok(p.matches.filter((m) => m.round === 1).every((m) => m.entryAId && m.entryBId), 'vòng 1 đủ hai cặp');
    }
  },

  'bye: cặp vào thẳng ở vòng 2, phía còn lại là "Thắng …"; rơi vào vị trí bốc đầu tiên'() {
    const p = plan(6);
    assert.deepEqual(p.byeEntryIds, p.groups[0].entryIds.slice(0, 2));
    for (const id of p.byeEntryIds) {
      const m = p.matches.find((x) => x.entryAId === id || x.entryBId === id);
      assert.equal(m.round, 2);
      const other = m.entryAId === id ? m.slotB : m.slotA;
      assert.equal(other.kind, 'progression');
      assert.match(other.label, /^Thắng /);
    }
    assert.deepEqual(p.warnings, ['KNOCKOUT_BYE']);
    assert.match(messageFor('KNOCKOUT_BYE').text, /vào thẳng vòng 2/);
    assert.deepEqual(plan(8).warnings, []);
  },

  'tên hiển thị đánh số liền trong vòng khi có bye; vòng sớm dùng "Vòng 1/N · Trận k"'() {
    assert.deepEqual(plan(6).matches.filter((m) => m.round === 1).map((m) => m.title), ['Tứ kết 1', 'Tứ kết 2']);
    const r1 = plan(12).matches.filter((m) => m.round === 1);
    assert.ok(r1.every((m) => m.roundLabel === 'Vòng 1/8' && /^Trận \d+$/.test(m.title)));
    assert.equal(plan(32).matches[0].roundLabel, 'Vòng 1/16');
  },

  'tiến cấp: thắng đi tiếp đúng ô cha; thua bán kết vào BRONZE; F/BRONZE không có cạnh ra'() {
    const p = plan(8, { thirdPlaceEnabled: true });
    assert.deepEqual(incoming(p, 'SF1', 'a')[0].source, { kind: 'match_outcome', matchKey: 'QF1', outcome: 'winner' });
    assert.deepEqual(incoming(p, 'SF1', 'b')[0].source, { kind: 'match_outcome', matchKey: 'QF2', outcome: 'winner' });
    assert.deepEqual(incoming(p, 'BRONZE', 'a')[0].source, { kind: 'match_outcome', matchKey: 'SF1', outcome: 'loser' });
    assert.deepEqual(incoming(p, 'BRONZE', 'b')[0].source, { kind: 'match_outcome', matchKey: 'SF2', outcome: 'loser' });
    assert.equal(p.progressions.filter((e) => ['F', 'BRONZE'].includes(e.source.matchKey)).length, 0);
    for (const m of p.matches.filter((x) => !['F', 'BRONZE'].includes(x.matchKey))) {
      assert.equal(p.progressions.filter((e) => e.source.matchKey === m.matchKey && e.source.outcome === 'winner').length, 1, m.matchKey);
    }
    assert.ok(p.progressions.every((e) => e.sourceStagePlanKey === 'knockout'));
  },

  'một stage knockout, entrants ghi vào chính stage đó; BO: chỉ F theo lựa chọn'() {
    const p = plan(8, { thirdPlaceEnabled: true, finalBestOf: 3 });
    assert.equal(p.stages.length, 1);
    assert.equal(p.stages[0].scheduleFormat, 'knockout');
    assert.deepEqual(p.groups.map((g) => [g.label, g.stagePlanKey, g.entryIds.length]), [[null, 'knockout', 8]]);
    const stage = { schedule_format: 'knockout', config: p.stages[0].config };
    for (const m of p.matches) {
      const bestOf = resolveMatchScoring({ default_scoring: {} }, {}, stage, { round: m.round, match_key: m.matchKey }).best_of;
      assert.equal(bestOf, m.matchKey === 'F' ? 3 : 1, m.matchKey);
    }
    const rows = estimateSchedule(p, { courtCount: 2, startTime: '08:00' }).rows;
    assert.equal(rows.find((r) => r.matchKey === 'F').bestOf, 3);
    assert.ok(rows.filter((r) => r.matchKey !== 'F').every((r) => r.bestOf === 1));
    assert.equal(plan(8).stages[0].config.match_scoring, undefined, 'BO1 chung kết thì không ghi đè');
  },

  'parity: cùng seed → cùng fingerprint dù thứ tự cặp đầu vào khác; đổi seed đổi nhánh'() {
    const a = plan(12, {}, 's1');
    const b = buildSetupPlan({ formatKey: 'knockout', config: {}, pairIds: pairIds(12).reverse(), seed: 's1', divisionId: '9' });
    assert.equal(a.fingerprint, b.fingerprint);
    assert.notEqual(a.fingerprint, plan(12, {}, 's2').fingerprint);
    assert.throws(() => plan(3), (e) => e.code === 'PAIR_COUNT_BELOW_MINIMUM' && e.params.min === 4);
    assert.throws(() => plan(8, {}, ''), (e) => e.code === 'DRAW_SEED_REQUIRED');
  },

  'bước 3: dưới 4 cặp chặn; ngoài 8–32 chỉ cảnh báo; đổi hạng ba sau khi bốc chỉ cần cập nhật xem trước'() {
    assert.ok(validateStep(pairedDraft(3, { formatKey: 'knockout', config: {} }), 3).blockers.some((b) => b.code === 'PAIR_COUNT_BELOW_MINIMUM'));
    const six = validateStep(pairedDraft(6, { formatKey: 'knockout', config: {} }), 3);
    assert.equal(six.ok, true);
    assert.deepEqual(six.warnings.map((w) => w.code), ['PAIR_COUNT_OUTSIDE_RECOMMENDED']);
    assert.equal(validateStep(pairedDraft(8, { formatKey: 'knockout', config: {} }), 3).warnings.length, 0);

    const p = plan(8);
    const draft = { ...pairedDraft(8, { formatKey: 'knockout', config: {} }), draw: { status: 'draft', seed: 'seed-ko', previewFingerprint: p.fingerprint, plan: p } };
    assert.equal(validateStep(draft, 4).ok, true);
    const stale = validateStep({ ...draft, format: { formatKey: 'knockout', config: { thirdPlaceEnabled: true } } }, 4).blockers[0];
    assert.equal(stale.code, 'DRAW_STALE');
    assert.equal(stale.params.groupsChanged, false, 'giữ vị trí bốc thăm, chỉ cập nhật xem trước');
    const preview = plan(8, { thirdPlaceEnabled: true });
    assert.deepEqual(preview.groups[0].entryIds, p.groups[0].entryIds, 'cùng seed → cùng vị trí trong nhánh');
  },

  'xếp hạng chung cuộc: BRONZE quyết định hạng 3/4 (engine knockout hiện có)'() {
    const p = plan(4, { thirdPlaceEnabled: true });
    const byKey = Object.fromEntries(p.matches.map((m) => [m.matchKey, m]));
    const done = (m, a, b) => ({ match_key: m.matchKey, round: m.round, status: 'done', entrant_a_id: a, entrant_b_id: b, winner_entrant_id: a });
    const [sf1, sf2] = [byKey.SF1, byKey.SF2];
    const matches = [
      done(sf1, sf1.entryAId, sf1.entryBId), done(sf2, sf2.entryAId, sf2.entryBId),
      done(byKey.BRONZE, sf1.entryBId, sf2.entryBId), done(byKey.F, sf1.entryAId, sf2.entryAId),
    ];
    const rows = knockoutEngine.computeStandings({}, pairIds(4).map((id) => ({ id })), matches);
    const rankOf = (id) => rows.find((r) => r.entrant_id === id).rank;
    assert.equal(rankOf(sf1.entryAId), 1);
    assert.equal(rankOf(sf2.entryAId), 2);
    assert.equal(rankOf(sf1.entryBId), 3);
    assert.equal(rankOf(sf2.entryBId), 4);
  },

  'UI: Bước 3 có cấu hình nhánh; Bước 4 hiện cặp vào thẳng, tên cặp ở ô đã biết, lịch theo vòng'() {
    const format = read('app/giai-dau/v2/setup-v3/steps/StepFormatPairing.js');
    const config = read('app/giai-dau/v2/setup-v3/steps/KnockoutConfig.js');
    const draw = read('app/giai-dau/v2/setup-v3/steps/StepDraw.js');
    assert.ok(format.includes("draft.format.formatKey === 'knockout' ? <KnockoutConfig"));
    assert.ok(config.includes('Có trận tranh hạng ba') && config.includes('Số ván trận chung kết'));
    assert.ok(draw.includes('Cặp được vào thẳng vòng 2:'));
    assert.ok(draw.includes("slot?.kind === 'entry' ? pairName(slot.entryId) : slot?.label"));
    assert.ok(draw.includes('function scheduleRound(match)'));
    assert.ok(draw.includes("plan.formatKey === 'knockout'\n        ? <KnockoutDraw") || draw.includes("plan.formatKey === 'knockout'\r\n        ? <KnockoutDraw"));
  },

  'console: nhánh loại trực tiếp v4 là chặng cuối → có nút kết thúc giải'() {
    const tab = read('app/giai-dau/v2/console/tabs/StandingsTab.js');
    assert.ok(tab.includes("(format === 'knockout' && isLastStage && String(stage?.config?.setupPlanVersion) === '4')"));
  },
});
