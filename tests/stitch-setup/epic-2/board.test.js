'use strict';
// Epic 2 E1 §4: view model mục Điều hành trên dữ liệu dựng từ plan thật (K1/K2/K3).

const { lib, assert, suite } = require('../_harness');
const { planFor, toDb } = require('./_fixture');

const { buildOperationsBoard } = lib('lib/tournament/operationsBoard');

const NOW = Date.parse('2026-10-12T08:30:00Z');
const courts = (n) => Array.from({ length: n }, (_, i) => ({ id: 70 + i, label: `Sân ${String(i + 1).padStart(2, '0')}`, active: true }));

function board(db, extra = {}) {
  return buildOperationsBoard({
    tournament: {},
    divisions: [{ id: 1 }],
    stages: db.stages,
    matches: db.matches,
    courts: extra.courts || courts(2),
    assignments: extra.assignments || [],
    entries: db.entries,
    transitions: db.transitions,
    gamesByMatchId: extra.gamesByMatchId || {},
    settings: { matchMinutes: 20, warmupMinutes: 4 },
  }, { now: NOW });
}

function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => allStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => allStrings(item, out));
  return out;
}

suite('epic-2 · operationsBoard', {
  'K3 vòng tròn: sân trống có gợi ý khác nhau, hàng chờ theo lượt': () => {
    const db = toDb(planFor('round_robin', 5));
    const view = board(db);
    assert.equal(view.courts.length, 2);
    assert.ok(view.courts.every((court) => court.state === 'idle' && court.suggestion));
    assert.notEqual(view.courts[0].suggestion.id, view.courts[1].suggestion.id);
    assert.equal(view.queue[0].label, 'Lượt 1');
    assert.equal(view.progress.total, db.matches.length);
    assert.ok(view.queue.flatMap((group) => group.matches).every((item) => item.readiness === 'ready'));
  },
  'cặp đang đấu ở sân khác → busy + tên sân; không được gợi ý': () => {
    const db = toDb(planFor('round_robin', 5));
    const live = db.matches[0];
    Object.assign(live, { status: 'live', started_at: '2026-10-12T08:20:00Z' });
    const busyEntry = live.entry_a_id;
    const view = board(db, { assignments: [{ match_id: live.id, court_id: 70 }] });
    assert.equal(view.courts[0].state, 'live');
    assert.equal(view.courts[0].clock.kind, 'elapsed');
    assert.equal(view.courts[0].clock.seconds, 600);
    const busy = view.queue.flatMap((group) => group.matches).filter((item) => item.a.entryId === busyEntry || item.b.entryId === busyEntry);
    assert.ok(busy.length > 0);
    assert.ok(busy.every((item) => item.readiness === 'busy' && item.busyCourt === 'Sân 01'));
    assert.ok(!busy.some((item) => item.id === view.courts[1].suggestion?.id));
  },
  'khởi động → đếm ngược; sân ngưng dùng → off, không gợi ý': () => {
    const db = toDb(planFor('round_robin', 5));
    Object.assign(db.matches[0], { status: 'warmup', warmup_started_at: '2026-10-12T08:29:00Z' });
    const view = board(db, {
      courts: [{ id: 70, label: 'Sân 01', active: true }, { id: 71, label: 'Sân 02', active: false }],
      assignments: [{ match_id: db.matches[0].id, court_id: 70 }],
    });
    assert.deepEqual(view.courts[0].clock, { kind: 'countdown', seconds: 180 });
    assert.equal(view.courts[1].state, 'off');
    assert.equal(view.courts[1].suggestion, null);
    assert.equal(view.progress.activeCourts, 1);
  },
  'K1 playoff: ô chờ hiện nguồn "Nhất bảng A", trận chờ → waiting; F luật BO3': () => {
    const db = toDb(planFor('group_knockout', 7, { finalBestOf: 3 }));
    const view = board(db);
    const items = view.queue.flatMap((group) => group.matches);
    const sf1 = items.find((item) => item.code === 'SF1');
    assert.equal(sf1.readiness, 'waiting');
    assert.equal(sf1.a.source, 'Nhất bảng A');
    assert.equal(sf1.winnerTo, 'Chung kết');
    const final = items.find((item) => item.code === 'F');
    assert.equal(final.a.source, 'Thắng Bán kết 1');
    assert.equal(final.rule.bestOf, 3);
    assert.equal(items.find((item) => item.code.startsWith('GROUP-')).rule.bestOf, 1);
  },
  'K2 loại kép: GF chờ nguồn nhánh; nhóm hàng chờ theo lượt có nhãn': () => {
    const db = toDb(planFor('double_elimination', 7, { finalBestOf: 3 }));
    const items = board(db).queue.flatMap((group) => group.matches);
    const gf = items.find((item) => item.code === 'GF');
    assert.equal(gf.title, 'Chung kết tổng');
    assert.equal(gf.a.source, 'Thắng Chung kết nhánh thắng');
    assert.equal(gf.b.source, 'Thắng Chung kết nhánh thua');
    assert.equal(gf.rule.bestOf, 3);
  },
  'Trận vừa chốt: mới nhất trước, có tỉ số và tên cặp thắng': () => {
    const db = toDb(planFor('round_robin', 5));
    const [first, second] = db.matches;
    Object.assign(first, { status: 'finalized', ended_at: '2026-10-12T08:00:00Z', winner_entry_id: first.entry_a_id });
    Object.assign(second, { status: 'finalized', ended_at: '2026-10-12T08:10:00Z', winner_entry_id: second.entry_b_id });
    const view = board(db, { gamesByMatchId: { [second.id]: [{ game_no: 1, kind: 'game', score_a: 7, score_b: 11 }] } });
    assert.equal(view.recent[0].id, second.id);
    assert.equal(view.recent[0].scoreText, '7–11');
    assert.ok(view.recent[0].winnerName);
    assert.equal(view.progress.finalized, 2);
  },
  'không lộ dữ liệu ngoài tên cặp và không có chuỗi cấm': () => {
    const view = board(toDb(planFor('double_elimination', 7)));
    const text = JSON.stringify(view);
    for (const key of ['phone', 'member_id', 'token', 'email']) assert.ok(!text.includes(`"${key}`), key);
    for (const value of allStrings(view)) assert.doesNotMatch(value, /Đội A|Đội B|Trận #|needs_call/);
  },
});
