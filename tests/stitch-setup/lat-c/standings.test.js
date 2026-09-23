'use strict';

// Hồi quy (phát hiện khi chạy thật Lát C): nhãn BXH loại trực tiếp lấy theo khoảng cách tới
// exit_round lớn nhất, nhưng engine cộng điểm thứ bậc cho vô địch/á quân/hạng ba/hạng tư, nên
// hạng ba hiện "Bán kết", hạng tư "Tứ kết", thua tứ kết "Vòng 1".
const { assert, lib, read, suite } = require('../_harness');
const { buildSetupPlan } = lib('lib/tournament/setupPlans/index.js');
const { knockoutPlacementLabels } = lib('lib/tournament/qualification.js');
const knockoutEngine = lib('lib/tournament/engines/knockout.js');

// Đánh hết một plan loại trực tiếp: bên a luôn thắng, điền cặp theo progressions như RPC 068.
function play(plan, { stopBefore } = {}) {
  const matches = plan.matches.map((m) => ({ match_key: m.matchKey, round: m.round, entrant_a_id: m.entryAId, entrant_b_id: m.entryBId, status: 'pending', winner_entrant_id: null }));
  const byKey = Object.fromEntries(matches.map((m) => [m.match_key, m]));
  for (const m of matches) {
    if (m.match_key === stopBefore) break;
    m.status = 'done';
    m.winner_entrant_id = m.entrant_a_id;
    const loser = m.entrant_b_id;
    for (const edge of plan.progressions.filter((e) => e.source.matchKey === m.match_key)) {
      byKey[edge.targetMatchKey][edge.targetSlot === 'a' ? 'entrant_a_id' : 'entrant_b_id'] = edge.source.outcome === 'winner' ? m.winner_entrant_id : loser;
    }
  }
  const entrants = plan.groups[0].entryIds.map((id) => ({ id }));
  const rows = knockoutEngine.computeStandings({}, entrants, matches);
  return knockoutPlacementLabels(rows, matches).sort((a, b) => a.rank - b.rank);
}

const plan = (n, config) => buildSetupPlan({ formatKey: 'knockout', config, pairIds: Array.from({ length: n }, (_, i) => `p${i + 1}`), seed: 's', divisionId: '9' });

suite('lát C — nhãn xếp hạng loại trực tiếp', {
  '6 cặp có hạng ba: Vô địch, Á quân, Hạng ba, Hạng tư, Tứ kết ×2'() {
    assert.deepEqual(play(plan(6, { thirdPlaceEnabled: true })).map((r) => `${r.rank}:${r.label}`),
      ['1:Vô địch', '2:Á quân', '3:Hạng ba', '4:Hạng tư', '5:Tứ kết', '5:Tứ kết']);
  },

  'không hạng ba: hai cặp thua bán kết đồng hạng ba'() {
    assert.deepEqual(play(plan(8)).map((r) => r.label),
      ['Vô địch', 'Á quân', 'Đồng hạng ba', 'Đồng hạng ba', 'Tứ kết', 'Tứ kết', 'Tứ kết', 'Tứ kết']);
  },

  'chung kết chưa đá: hai cặp "Vào chung kết", chưa có vô địch'() {
    const labels = play(plan(4), { stopBefore: 'F' }).map((r) => r.label);
    assert.deepEqual(labels.slice(0, 2), ['Vào chung kết', 'Vào chung kết']);
    assert.equal(labels.includes('Vô địch'), false);
  },

  'nhánh 16: thua vòng đầu là "Vòng 1/8"'() {
    const rows = play(plan(16));
    assert.equal(rows[rows.length - 1].label, 'Vòng 1/8');
  },

  'áp dụng chung: service xếp hạng gắn nhãn, trang công khai giữ trường label'() {
    assert.ok(read('lib/tournament/standingsService.js').includes("stage.schedule_format === 'knockout' ? knockoutPlacementLabels(standings, loaded.matches)"));
    assert.ok(read('lib/tournament/publicSnapshot.js').includes("'seed', 'rank', 'exit_round', 'label',"));
    assert.ok(read('app/giai-dau/v2/console/standingsRender.js').includes('r.label || koLabel(r.exit_round, maxExit)'));
  },
});
