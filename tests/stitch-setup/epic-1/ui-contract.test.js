'use strict';
// Epic 1 — Lát D2 §6: hợp đồng giao diện loại kép (kiểm tĩnh mã nguồn, không cần trình duyệt).

const { assert, read, lib, suite } = require('../_harness');

const { estimateSchedule } = lib('lib/tournament/setupSchedule.js');
const { describeRound } = lib('lib/tournament/rules/roundScoring.js');
const { dePlan } = require('./_de');

const stepFormat = read('app/giai-dau/v2/setup-v3/steps/StepFormatPairing.js');
const deConfig = read('app/giai-dau/v2/setup-v3/steps/DoubleElimConfig.js');
const stepDraw = read('app/giai-dau/v2/setup-v3/steps/StepDraw.js');
const bracketRender = read('app/giai-dau/v2/console/bracketRender.js');
const bracketTab = read('app/giai-dau/v2/console/tabs/BracketTab.js');
const standingsTab = read('app/giai-dau/v2/console/tabs/StandingsTab.js');
const standingsRender = read('app/giai-dau/v2/console/standingsRender.js');
const publicPage = read('app/giai-dau/v2/[slug]/page.js');

suite('Epic 1 D2 — giao diện loại kép', {
  'Bước 3: thẻ Loại kép có mô tả, cấu hình riêng với BO chung kết tổng'() {
    assert.ok(stepFormat.includes("double_elimination: 'Thua hai trận mới bị loại"));
    assert.ok(stepFormat.includes("draft.format.formatKey === 'double_elimination' ? <DoubleElimConfig"));
    assert.ok(deConfig.includes('data-testid="double-elim-config"'));
    assert.ok(deConfig.includes("'Chung kết tổng', 'final'"));
    assert.ok(deConfig.includes('BO1 (cố định)'));
    assert.ok(deConfig.includes('Không đá lại chung kết tổng'), 'nói rõ D14');
    assert.equal(/thirdPlaceEnabled/.test(deConfig), false, 'không có tranh hạng ba (D22)');
  },

  'Bước 4: ba khung W/L/GF, bye vào vòng 2 nhánh thắng, tiêu chí xếp hạng D22'() {
    assert.ok(stepDraw.includes('data-testid="double-elim-bracket"'));
    assert.ok(stepDraw.includes("plan.formatKey === 'double_elimination' || plan.formatKey === 'knockout'\n        ? <KnockoutDraw"));
    assert.ok(stepDraw.includes("[['W', 'Nhánh thắng'], ['L', 'Nhánh thua'], ['GF', 'Chung kết tổng']]"));
    assert.ok(stepDraw.includes('Cặp được vào thẳng vòng 2 nhánh thắng:'));
    assert.ok(stepDraw.includes('data-testid="double-elim-criteria"'));
    assert.ok(stepDraw.includes("match.matchKey === 'F' || match.matchKey === 'GF'"), 'BO chung kết tổng');
  },

  'ước lượng lịch: GF dùng BO đã chọn, trận khác BO1; xếp theo lượt'() {
    const plan = dePlan(7, { finalBestOf: 3 });
    const estimate = estimateSchedule(plan, { courtCount: 2, startTime: '07:30' });
    assert.equal(estimate.rows.length, 12);
    assert.equal(estimate.rows.find((row) => row.matchKey === 'GF').bestOf, 3);
    assert.ok(estimate.rows.filter((row) => row.matchKey !== 'GF').every((row) => row.bestOf === 1));
    const position = new Map(estimate.rows.map((row, index) => [row.matchKey, index]));
    for (const edge of plan.progressions) {
      assert.ok(position.get(edge.source.matchKey) < position.get(edge.targetMatchKey), `${edge.source.matchKey} phải xếp trước ${edge.targetMatchKey}`);
    }
  },

  'bàn điều hành: tab Sơ đồ, BXH, nút kết thúc giải nhận double_elim'() {
    assert.ok(bracketRender.includes('export function DoubleElimBracketView'));
    assert.ok(bracketRender.includes("from '@/lib/tournament/doubleElimKeys'"), 'suy nhánh từ match_key, không từ round');
    assert.ok(bracketRender.includes('entrantsById={entrantsById} noByes />'), 'ô chờ loại kép không hiện BYE');
    assert.ok(bracketTab.includes("new Set(['knockout', 'double_elim'])"));
    assert.ok(bracketTab.includes('<DoubleElimBracketView'));
    assert.ok(standingsTab.includes("(format === 'double_elim' && isLastStage && String(stage?.config?.setupPlanVersion) === '4')"));
    assert.ok(standingsRender.includes("scheduleFormat === 'knockout' || scheduleFormat === 'double_elim'"));
    assert.ok(standingsRender.includes("r.rank ?? '–'"), 'cặp đang thi đấu không có hạng');
    assert.equal(describeRound({ schedule_format: 'double_elim' }, '3', 6), 'Lượt 3');
  },

  'trang công khai: sơ đồ loại kép'() {
    assert.ok(publicPage.includes("const isDoubleElim = stage.schedule_format === 'double_elim';"));
    assert.ok(publicPage.includes('<DoubleElimBracketView'));
  },
});
