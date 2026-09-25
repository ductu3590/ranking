'use strict';
// Lát E3 (spec lat-e3-trang-cong-khai.md): trang công khai 4 tab dùng view model board đã chiếu công khai.

const { lib, read, assert, suite } = require('../_harness');
const { planFor, toDb } = require('./_fixture');

const { buildOperationsBoard } = lib('lib/tournament/operationsBoard');
const { projectPublicBoard } = lib('lib/tournament/publicBoard');

function publicBoard(formatKey, n, mutate) {
  const db = toDb(planFor(formatKey, n, { thirdPlaceEnabled: true }));
  if (mutate) mutate(db);
  return projectPublicBoard(buildOperationsBoard({
    tournament: { status: 'live', settings: { operations: { secret: 'x' } } }, divisions: [{ id: 1 }], stages: db.stages, matches: db.matches,
    courts: [{ id: 70, label: 'Sân 01', active: true }], assignments: db.matches[0] ? [{ match_id: db.matches[0].id, court_id: 70 }] : [],
    entries: db.entries, transitions: db.transitions,
    gamesByMatchId: { [db.matches[0].id]: [{ match_id: db.matches[0].id, game_no: 1, kind: 'game', score_a: 7, score_b: 3 }] },
    settings: { matchMinutes: 20, warmupMinutes: 4 },
  }, { now: Date.parse('2026-10-12T08:30:00Z') }));
}

const PAGE = read('app/giai-dau/v2/[slug]/PublicLive.js');

suite('epic-2 · E3 trang công khai', {
  'board công khai: không version/busyCourt/stageAction/settings, không khóa nhạy cảm': () => {
    const board = publicBoard('group_knockout', 7, (db) => { Object.assign(db.matches[0], { status: 'live', started_at: '2026-10-12T08:20:00Z' }); });
    const text = JSON.stringify(board);
    for (const bad of ['"version"', 'busyCourt', 'stageAction', 'secret', 'phone', 'member_id', 'token', 'tournamentStatus']) {
      assert.ok(!text.includes(bad), bad);
    }
    assert.deepEqual(Object.keys(board).sort(), ['courts', 'progress', 'recent', 'schedule', 'stages']);
    assert.equal(board.courts.length, 1);
    assert.deepEqual(board.courts[0].match.games, [{ a: 7, b: 3 }], 'thẻ sân có ván đã lưu');
    assert.ok(board.schedule.flatMap((group) => group.matches).every((item) => Array.isArray(item.games)));
  },
  'route public: board chỉ cho giải v4, cột mới không lọt vào snapshot cũ': () => {
    const route = read('app/api/tournament-v2/public/route.js');
    assert.ok(route.includes('projectPublicBoard(buildOperationsBoard('));
    assert.ok(/isV4 = stages\.length > 0 && stages\.every/.test(route));
    const snapshot = lib('lib/tournament/publicSnapshot');
    for (const field of ['match_key', 'warmup_started_at', 'started_at', 'ended_at']) assert.ok(!snapshot.PUBLIC_MATCH_FIELDS.includes(field), field);
  },
  'đúng 4 tab, mặc định theo trạng thái, Sơ đồ chỉ khi có stage loại trực tiếp/loại kép': () => {
    assert.ok(/\['live', 'Trực tiếp'\], \['schedule', 'Lịch'\], \['standings', 'Xếp hạng'\], \.\.\.\(hasBracket \? \[\['bracket', 'Sơ đồ'\]\] : \[\]\)/.test(PAGE));
    assert.ok(/if \(status === 'live'\) return 'live';/.test(PAGE));
    assert.ok(/if \(status === 'completed' \|\| status === 'archived'\) return 'standings';/.test(PAGE));
    assert.ok(/stage\.format !== 'round_robin'/.test(PAGE), 'Sơ đồ theo định dạng stage');
    // vòng tròn thuần: không có nhóm sơ đồ
    const rr = publicBoard('round_robin', 5);
    assert.ok(rr.stages.every((stage) => stage.format === 'round_robin'));
    const ko = publicBoard('group_knockout', 7);
    assert.ok(ko.stages.some((stage) => stage.format === 'knockout'));
    const bronze = publicBoard('group_knockout', 8).schedule.find((group) => group.key.endsWith(':third_place'));
    assert.ok(bronze && bronze.matches.every((item) => item.code === 'BRONZE'), 'Tranh hạng ba nhóm theo match_key');
  },
  'chỉ đọc: không import thao tác ghi, BracketView không nhận onSelectMatch, không ảnh poster': () => {
    assert.ok(!/saveGames|transitionMatch|withdrawMatch|applyCorrection|updateTournament|tournamentV2Client/.test(PAGE));
    assert.ok(/<BracketView groups=\{view\.bracketGroups\} \/>/.test(PAGE));
    assert.ok(!/onSelectMatch/.test(PAGE));
    assert.ok(!/<img/.test(PAGE), 'header không poster');
  },
  'trang công khai không có vỏ app CLB (Stitch OPS-07), trang CLB vẫn có': () => {
    const shell = read('components/pickhub/AppShell.js');
    assert.ok(shell.includes('if (isBarePublicPath(pathname)) return <main className="ph-shell-bare">{children}</main>;'));
    const re = /^\/giai-dau\/v2\/[^/]+(\/noi-dung\/[^/]+)?\/?$/;
    for (const path of ['/giai-dau/v2/giai-abc', '/giai-dau/v2/giai-abc/noi-dung/12']) assert.ok(re.test(path), path);
    for (const path of ['/giai-dau/v2', '/giai-dau', '/giai-dau/admin', '/dieu-hanh-giai/220']) assert.ok(!re.test(path), path);
    assert.ok(PAGE.includes("data.club?.name"), 'tên CLB trên thanh trên');
    assert.ok(read('lib/tournament/publicBoard.js').includes("'projectedCourt'"), 'sân dự kiến ở Sắp tới');
  },
  'trang cũ vẫn chạy cho giải không có board; division lạ vẫn báo không tồn tại': () => {
    const page = read('app/giai-dau/v2/[slug]/page.js');
    assert.ok(page.includes('if (data.board) return <PublicLive data={data} />;'));
    const division = read('app/giai-dau/v2/[slug]/noi-dung/[division]/DivisionPublicView.js');
    const notFound = division.indexOf('Nội dung thi đấu không tồn tại trong giải này.');
    const live = division.indexOf('<PublicLive data={data} initialDivisionId={division.id} />');
    assert.ok(notFound > 0 && live > notFound, 'kiểm division trước khi render trang mới');
  },
});
