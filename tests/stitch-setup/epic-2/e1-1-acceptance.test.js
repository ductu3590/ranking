'use strict';
// Lát E1.1 (sửa sau nghiệm thu Epic 2, 2026-09-24): D34 luật điểm "bên nhiều điểm hơn thắng",
// D35 chuyển chặng / kết thúc giải ngay trong mục Điều hành, D36 kết thúc giải đổi trạng thái giải.

const { lib, read, assert, suite } = require('../_harness');
const { planFor, toDb } = require('./_fixture');

const { validateGameScore } = lib('lib/tournament/rules/scoring');
const { buildOperationsBoard } = lib('lib/tournament/operationsBoard');

const courts = [{ id: 71, label: 'Sân 01', active: true }, { id: 72, label: 'Sân 02', active: true }];

function finalize(match, a, b) {
  Object.assign(match, { status: 'finalized', winner_entry_id: a > b ? match.entry_a_id : match.entry_b_id, ended_at: '2026-10-12T08:10:00Z' });
  return [{ match_id: match.id, game_no: 1, kind: 'game', score_a: a, score_b: b }];
}

function board(db, { tournament = { status: 'live' }, games = {}, assignments = [] } = {}) {
  return buildOperationsBoard({
    tournament, divisions: [{ id: 1 }], stages: db.stages, matches: db.matches, courts, assignments,
    entries: db.entries, transitions: db.transitions, gamesByMatchId: games, settings: { matchMinutes: 20, warmupMinutes: 4 },
  }, { now: Date.parse('2026-10-12T08:30:00Z') });
}

function groupKnockout() {
  const db = toDb(planFor('group_knockout', 7));
  db.stages.forEach((stage) => { stage.status = 'active'; });
  return db;
}

suite('epic-2 · E1.1 sau nghiệm thu', {
  'D34: vượt 15, không cố định mốc điểm, chỉ chặn hoà / âm / lẻ': () => {
    assert.ok(validateGameScore({ score_a: 17, score_b: 15 }, { points_to: 15, win_by: 2, cap: 15 }).ok);
    assert.ok(validateGameScore({ score_a: 21, score_b: 19 }, { points_to: 11, win_by: 2, cap: 15 }).ok);
    assert.ok(validateGameScore({ score_a: 5, score_b: 3 }, { points_to: 11 }).ok);
    assert.ok(validateGameScore({ score_a: 15, score_b: 14 }, { points_to: 15, win_by: 2 }).ok);
    for (const bad of [[11, 11], [-1, 11], [11.5, 3]]) {
      assert.equal(validateGameScore({ score_a: bad[0], score_b: bad[1] }, {}).code, 'INVALID_SCORE', JSON.stringify(bad));
    }
  },
  'D34: sheet nhập tỉ số và route không còn thông báo mốc tới / cách / trần': () => {
    const sheet = read('app/giai-dau/v2/console/control/ScoreSheet.js');
    assert.ok(!/POINTS_TO_NOT_REACHED|WIN_BY_NOT_MET|SCORE_CAP_EXCEEDED/.test(sheet));
    assert.ok(sheet.includes('bên nhiều điểm hơn thắng ván'));
    for (const file of ['app/api/tournament-v2/games/route.js', 'app/api/tournament-v2/corrections/route.js']) {
      assert.ok(!read(file).includes('cách ${scoring.win_by}'), file);
    }
  },
  'D35: vòng bảng chốt hết trận → stageAction advance sang vòng loại trực tiếp': () => {
    const db = groupKnockout();
    const games = {};
    let partial = board(db);
    assert.equal(partial.stageAction, null, 'còn trận vòng bảng thì chưa có hành động');
    for (const match of db.matches.filter((item) => item.stage_id === db.stages[0].id)) Object.assign(games, { [match.id]: finalize(match, 11, 6) });
    const view = board(db, { games });
    assert.equal(view.stageAction.kind, 'advance');
    assert.equal(view.stageAction.stageId, db.stages[0].id);
    assert.equal(view.stageAction.nextStageId, db.stages[1].id);
    assert.deepEqual(view.stages.map((stage) => stage.id), db.stages.map((stage) => stage.id));
  },
  'D35/D36: chặng cuối chốt hết → finish; mọi chặng completed nhưng giải chưa kết thúc → complete': () => {
    const db = groupKnockout();
    db.matches.forEach((match) => finalize(match, 11, 4));
    db.stages[0].status = 'completed';
    assert.equal(board(db).stageAction.kind, 'finish');
    db.stages[1].status = 'completed';
    const pending = board(db, { tournament: { status: 'live' } });
    assert.equal(pending.stageAction.kind, 'complete');
    assert.equal(board(db, { tournament: { status: 'completed' } }).stageAction, null, 'giải đã kết thúc thì không còn nút');
  },
  'Trận vừa chốt: điểm cặp thắng đứng trước, kèm tên cặp thua': () => {
    const db = groupKnockout();
    const match = db.matches[0];
    const games = { [match.id]: finalize(match, 9, 11) };
    const [recent] = board(db, { games }).recent;
    assert.equal(recent.scoreText, '11–9');
    assert.equal(recent.winnerEntryId, match.entry_b_id);
    assert.ok(recent.loserName);
  },
  'KPI: sân đang dùng đếm sân có trận, không đếm sân trống': () => {
    const db = groupKnockout();
    Object.assign(db.matches[0], { status: 'live', started_at: '2026-10-12T08:20:00Z' });
    const view = board(db, { assignments: [{ match_id: db.matches[0].id, court_id: 71 }] });
    assert.equal(view.progress.busyCourts, 1);
    assert.equal(view.progress.activeCourts, 2);
  },
  'UI: Điều hành có thẻ việc tiếp theo; kết thúc giải PATCH trạng thái completed ở cả hai lối vào': () => {
    const center = read('app/giai-dau/v2/console/control/ControlCenter.js');
    assert.ok(center.includes('<NextStepCard'));
    assert.ok(!center.includes('Xem xếp hạng và kết thúc giải ở mục'));
    const action = read('app/giai-dau/v2/console/stageAction.js');
    assert.ok(action.includes("status: 'completed'"));
    assert.ok(read('app/giai-dau/v2/console/tabs/StandingsTab.js').includes('runStageAction'));
  },
});
