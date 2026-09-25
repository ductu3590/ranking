'use strict';
// Lát E2 (spec lat-e2-tran-dau-so-do-cai-dat.md): Trận đấu · Sơ đồ & xếp hạng · Cài đặt cho giải setup v4.

const { lib, read, exists, assert, suite } = require('../_harness');
const { planFor, toDb } = require('./_fixture');

const { buildOperationsBoard } = lib('lib/tournament/operationsBoard');
const { describeOperationLog, KNOWN_ACTIONS } = lib('lib/tournament/operationLogText');

function board(db, games = {}) {
  return buildOperationsBoard({
    tournament: { status: 'live' }, divisions: [{ id: 1 }], stages: db.stages, matches: db.matches, courts: [], assignments: [],
    entries: db.entries, transitions: db.transitions, gamesByMatchId: games, settings: { matchMinutes: 20, warmupMinutes: 4 },
  }, { now: Date.parse('2026-10-12T08:30:00Z') });
}

const LOGGED_ACTIONS = [
  'match_called', 'match_call_cancelled', 'match_started', 'match_paused', 'match_resumed', 'match_finalized',
  'match_walkover', 'match_retired', 'result_corrected', 'court_toggled', 'tournament_status_changed',
  'draw_locked', 'draw_unlocked', 'draw_rolled', 'draw_swapped',
];

suite('epic-2 · E2 Trận đấu / Sơ đồ / Cài đặt', {
  'schedule: nhóm theo match_key, Tranh hạng ba là nhóm riêng không chung Chung kết': () => {
    const db = toDb(planFor('group_knockout', 8, { thirdPlaceEnabled: true }));
    const view = board(db);
    const keys = view.schedule.map((group) => group.key.split(':').slice(1).join(':'));
    assert.ok(keys.includes('third_place'));
    assert.ok(keys.includes('final'));
    const final = view.schedule.find((group) => group.key.endsWith(':final'));
    assert.ok(final.matches.every((item) => item.code === 'F'));
    assert.equal(view.schedule.reduce((sum, group) => sum + group.matches.length, 0), db.matches.length);
    const strings = JSON.stringify(view.schedule);
    assert.ok(!/Đội A|Đội B|Trận #/.test(strings));
  },
  'schedule: tỉ số theo A–B, winnerSide, ô chờ theo nguồn': () => {
    const db = toDb(planFor('group_knockout', 7));
    const match = db.matches[0];
    Object.assign(match, { status: 'finalized', winner_entry_id: match.entry_b_id });
    const view = board(db, { [match.id]: [{ match_id: match.id, game_no: 1, kind: 'game', score_a: 9, score_b: 11 }] });
    const item = view.schedule.flatMap((group) => group.matches).find((row) => row.id === match.id);
    assert.deepEqual(item.games, [{ a: 9, b: 11 }]);
    assert.equal(item.winnerSide, 'b');
    const sf = view.schedule.flatMap((group) => group.matches).find((row) => row.code === 'SF1');
    assert.ok(/bảng/i.test(sf.a.source));
  },
  'loại kép: nhóm W/L/GF đủ, có Chung kết nhánh thua': () => {
    const db = toDb(planFor('double_elimination', 8));
    const keys = board(db).schedule.map((group) => group.key.split(':').slice(1).join(':'));
    assert.ok(keys.some((key) => key.startsWith('W:')));
    assert.ok(keys.some((key) => key.startsWith('L:')));
    assert.ok(keys.includes('grand_final'));
    const titles = board(db).schedule.map((group) => group.title);
    assert.ok(titles.includes('Chung kết nhánh thua'), titles.join(' | '));
  },
  'nhật ký: mọi action đang ghi → câu tiếng Việt, không JSON; action lạ → câu chung': () => {
    assert.deepEqual([...KNOWN_ACTIONS].sort(), [...LOGGED_ACTIONS].sort());
    for (const action of LOGGED_ACTIONS) {
      const line = describeOperationLog({ action, actor: 'admin', target_type: 'match', target_id: 1, before: { status: 'live', games: [{ score_a: 11, score_b: 9 }] }, after: { status: 'completed', active: false, games: [{ score_a: 9, score_b: 11 }] } }, {});
      assert.ok(!/[{}]/.test(line.text), `${action}: ${line.text}`);
      assert.ok(!line.text.includes(action), `${action} phải thành câu`);
    }
    assert.ok(describeOperationLog({ action: 'something_new', after: { a: 1 } }).text.includes('something new'));
    // action trong route khớp danh sách
    const routes = ['match-transition', 'withdraw', 'corrections', 'courts', 'tournaments', 'draw'].map((name) => read(`app/api/tournament-v2/${name}/route.js`)).join('\n')
      + read('lib/tournament/matchLifecycle.js') + read('lib/tournament/scoreEntry.js');
    const found = new Set([...routes.matchAll(/action: '([a-z_]+)'/g), ...routes.matchAll(/log\(access, stage, '([a-z_]+)'/g)].map((m) => m[1]));
    for (const action of found) if (/^(match_|result_|court_|tournament_|draw_)/.test(action)) assert.ok(KNOWN_ACTIONS.includes(action), `thiếu câu cho ${action}`);
  },
  'Trận đấu: sửa kết quả đi corrections (preview → lý do → apply), không gọi saveGames cho trận đã chốt': () => {
    const sheet = read('app/giai-dau/v2/console/control/ScoreSheet.js');
    assert.ok(sheet.includes('previewCorrection') && sheet.includes('applyCorrection'));
    assert.ok(/!readOnly && !finalized \? <footer/.test(sheet), 'nút lưu nháp/chốt chỉ khi trận chưa chốt');
    assert.ok(sheet.includes('Lý do sửa (bắt buộc)'));
    assert.ok(read('app/api/tournament-v2/corrections/route.js').includes('classifyRpcConflict(mutationError)'));
    const view = read('app/giai-dau/v2/console/matches/MatchesView.js');
    assert.ok(!/BO1\/BO3|RoundGroupHead|RoundScoringPanel/.test(view), 'không có ô BO theo vòng');
  },
  'Sơ đồ & xếp hạng: component chung không fetch, chỉ bấm được khi có onSelectMatch': () => {
    for (const file of ['app/giai-dau/v2/shared/BracketView.js', 'app/giai-dau/v2/shared/StandingsView.js']) {
      assert.ok(exists(file), file);
      const source = read(file);
      assert.ok(!/tournamentV2Client|fetch\(/.test(source), `${file} không tự fetch`);
    }
    const bracket = read('app/giai-dau/v2/shared/BracketView.js');
    assert.ok(bracket.includes('if (onSelectMatch) return <button'));
    assert.ok(!read('app/giai-dau/v2/shared/StandingsView.js').includes('knockoutPlacementLabels'));
  },
  'Cài đặt: không Sinh lại lịch / Số ván theo vòng; bật link sinh slug ở PATCH; đăng ký mở chỉ giải cộng đồng': () => {
    const settings = read('app/giai-dau/v2/console/settings/SettingsView.js');
    assert.ok(!/Sinh lại lịch|Số ván theo vòng|Điều lệ MLP|generateSchedule/.test(settings));
    assert.ok(!/JSON\.stringify/.test(settings), 'nhật ký không in JSON');
    assert.ok(settings.includes('Lý do (bắt buộc)'));
    const route = read('app/api/tournament-v2/tournaments/route.js');
    assert.ok(/payload\.visibility === 'unlisted' \|\| payload\.visibility === 'public'[\s\S]{0,400}generateSlug/.test(route));
    const console = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
    assert.ok(/isCommunity \? <div id="dang-ky-mo">/.test(console));
    assert.ok(console.includes('<SettingsView') && console.includes('<MatchesView') && console.includes('<BracketStandings'));
  },
});
