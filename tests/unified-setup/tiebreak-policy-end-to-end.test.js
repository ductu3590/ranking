'use strict';

// ============================================================================
// REGRESSION — chính sách tie-break phải đi XUYÊN SUỐT một cách thống nhất.
//
// Lỗi gốc (round 3 ghi nhận, chưa sửa):
//   app/api/tournament-v2/standings/route.js gọi resolveTiebreak({}, {}, stage)
//   và lib/tournament/standingsService.js truyền thẳng stage.config vào engine.
//   Hệ quả: division.tiebreak_override và tournament.tiebreak_policy KHÔNG BAO
//   GIỜ tới được computeStandings, nên BXH luôn tính theo legacy_v2 dù BTC đã
//   chọn thể thức khác. Nhãn luật hiển thị cũng resolve riêng một đường.
//
// Fixture được dựng để HAI CHÍNH SÁCH HỢP LỆ CHO KẾT QUẢ KHÁC NHAU:
//   bảng A hòa 3 chiều (mỗi đội 1 thắng 1 thua)
//     legacy_v2          (match_points -> diff ...)       => 102, 101, 103
//     hieu_so_van_truoc  (match_points -> game_diff ...)  => 101, 103, 102
//   nghĩa là suất A1/A2 đổi hẳn: A1 102->101, A2 101->103.
// Vì vậy test này KHÔNG chỉ kiểm tên field; nó kiểm kết quả thật sự đổi.
//
// Chạy: node tests/unified-setup/tiebreak-policy-end-to-end.test.js
// ============================================================================

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const {
    TIEBREAK_PRESETS,
    resolveTiebreak,
    rankStandings,
} = require(path.join(ROOT, 'lib/tournament/rules/tiebreak'));
const standingsService = require(path.join(ROOT, 'lib/tournament/standingsService'));
const roundRobin = require(path.join(ROOT, 'lib/tournament/engines/roundRobin'));

let checks = 0;
function check(condition, message) {
    assert.ok(condition, message);
    checks += 1;
}
function equal(actual, expected, message) {
    assert.deepStrictEqual(actual, expected, message + ' (nhan: ' + JSON.stringify(actual) + ')');
    checks += 1;
}

// --------------------------------------------------------------------------
// 0. Fixture dùng chung: 2 bảng, bảng A hòa 3 chiều.
// --------------------------------------------------------------------------
const GROUP_ID = 9901;
const TOURNAMENT_ID = 7001;
const DIVISION_ID = 7101;
const STAGE_ID = 7201;

const ENTRY_IDS = [101, 102, 103, 104, 105, 106];
const STAGE_ENTRANTS = [
    { entry_id: 101, entrant_id: null, seed_in_stage: 1, group_label: 'A' },
    { entry_id: 102, entrant_id: null, seed_in_stage: 2, group_label: 'A' },
    { entry_id: 103, entrant_id: null, seed_in_stage: 3, group_label: 'A' },
    { entry_id: 104, entrant_id: null, seed_in_stage: 1, group_label: 'B' },
    { entry_id: 105, entrant_id: null, seed_in_stage: 2, group_label: 'B' },
    { entry_id: 106, entrant_id: null, seed_in_stage: 3, group_label: 'B' },
];

// Mỗi trận BO3. Ván ghi rõ để engine tự cộng điểm/ván; không bịa sẵn tổng.
// A: 101 > 102 (2-0, 22-18) | 102 > 103 (2-1, 27-15) | 103 > 101 (2-1, 31-29)
//   => game_diff: 101 +1, 103 0, 102 -1
//   => point diff: 102 +8, 101 +2, 103 -10
// B: 104 thắng cả hai, 105 thắng 106 — không hòa, dùng làm đối chứng bất biến.
const DEFAULT_MATCH_GAMES = {
    301: [[11, 9], [11, 9]],
    302: [[11, 2], [5, 11], [11, 2]],
    303: [[11, 9], [9, 11], [11, 9]],
    304: [[11, 4], [11, 4]],
    305: [[11, 5], [11, 5]],
    306: [[11, 6], [11, 6]],
};
// Mỗi trận CHỈ MỘT ván: BO1 phải coi là đã xong, BO3 thì chưa.
const SINGLE_GAME_MATCHES = {
    301: [[11, 9]], 302: [[11, 2]], 303: [[11, 9]],
    304: [[11, 4]], 305: [[11, 5]], 306: [[11, 6]],
};
const MATCH_ROWS = [
    [301, 'A', 101, 102, 101],
    [302, 'A', 102, 103, 102],
    [303, 'A', 103, 101, 103],
    [304, 'B', 104, 105, 104],
    [305, 'B', 104, 106, 104],
    [306, 'B', 105, 106, 105],
].map(function (row) {
    const id = row[0];
    return {
        id: id,
        group_id: GROUP_ID,
        stage_id: STAGE_ID,
        division_id: DIVISION_ID,
        group_label: row[1],
        round: 1,
        match_key: 'RR-' + id,
        entry_a_id: row[2],
        entry_b_id: row[3],
        entrant_a_id: null,
        entrant_b_id: null,
        winner_entry_id: row[4],
        winner_entrant_id: null,
        status: 'finalized',
        version: 2,
    };
});

const BASE_STAGE = {
    id: STAGE_ID,
    tournament_id: TOURNAMENT_ID,
    division_id: DIVISION_ID,
    schedule_format: 'round_robin',
    match_format: 'simple',
    config: { groupCount: 2 },
};

// db giả — chỉ đủ cho loadScoringContext + loadStageData.
function makeDb(options) {
    const tournament = options.tournament;
    const division = options.division;
    const MATCH_GAMES = options.games || DEFAULT_MATCH_GAMES;
    const rowsFor = (state) => {
        switch (state.table) {
            case 'tournament_stage_entrants':
                return STAGE_ENTRANTS;
            case 'tournament_entries':
                return ENTRY_IDS.map((id) => ({ id: id, seed: ENTRY_IDS.indexOf(id) + 1 }));
            case 'tournament_matches':
                return MATCH_ROWS;
            case 'tournament_games': {
                const out = [];
                Object.keys(MATCH_GAMES).forEach((matchId) => {
                    MATCH_GAMES[matchId].forEach((game, index) => {
                        out.push({
                            match_id: Number(matchId),
                            score_a: game[0],
                            score_b: game[1],
                            kind: 'normal',
                            game_no: index + 1,
                        });
                    });
                });
                return out;
            }
            case 'tournaments':
                return [tournament];
            case 'tournament_divisions':
                return [division];
            default:
                return [];
        }
    };
    const build = (table) => {
        const state = { table: table };
        const thenable = {
            select() { return thenable; },
            eq() { return thenable; },
            in() { return thenable; },
            order() { return thenable; },
            maybeSingle() { return Promise.resolve({ data: rowsFor(state)[0] || null, error: null }); },
            single() { return Promise.resolve({ data: rowsFor(state)[0] || null, error: null }); },
            then(res, rej) { return Promise.resolve({ data: rowsFor(state), error: null }).then(res, rej); },
        };
        return thenable;
    };
    return { from: build };
}

function makeContextErrorDb(tableWithError) {
    return {
        from(table) {
            const query = {
                select() { return query; },
                eq() { return query; },
                maybeSingle() {
                    return Promise.resolve(table === tableWithError
                        ? { data: null, error: { message: 'simulated policy read failure' } }
                        : { data: {}, error: null });
                },
            };
            return query;
        },
    };
}

function groupOrder(standings, label) {
    return standings
        .filter((row) => (row.group_label || 'A') === label)
        .sort((a, b) => a.rank - b.rank)
        .map((row) => row.entrant_id);
}

const LEGACY_ORDER_A = [102, 101, 103];
const GAME_DIFF_ORDER_A = [101, 103, 102];

// --------------------------------------------------------------------------
// 1. Fixture thật sự phân biệt được hai chính sách.
// --------------------------------------------------------------------------
{
    const rows = [
        { entrant_id: 101, group_label: 'A', match_points: 2, diff: 2, point_diff: 2, game_diff: 1, points_for: 51, seed: 1 },
        { entrant_id: 102, group_label: 'A', match_points: 2, diff: 8, point_diff: 8, game_diff: -1, points_for: 45, seed: 2 },
        { entrant_id: 103, group_label: 'A', match_points: 2, diff: -10, point_diff: -10, game_diff: 0, points_for: 46, seed: 3 },
    ];
    const matches = MATCH_ROWS.slice(0, 3).map((m) => Object.assign({}, m, {
        entrant_a_id: m.entry_a_id,
        entrant_b_id: m.entry_b_id,
        winner_entrant_id: m.winner_entry_id,
        status: 'done',
    }));
    const legacy = rankStandings(rows.map((r) => Object.assign({}, r)), matches, TIEBREAK_PRESETS.legacy_v2, 1);
    const gameFirst = rankStandings(rows.map((r) => Object.assign({}, r)), matches, TIEBREAK_PRESETS.hieu_so_van_truoc, 1);
    equal(groupOrder(legacy, 'A'), LEGACY_ORDER_A, 'fixture: legacy_v2 xep theo hieu so diem');
    equal(groupOrder(gameFirst, 'A'), GAME_DIFF_ORDER_A, 'fixture: hieu_so_van_truoc xep theo hieu so van');
    check(
        JSON.stringify(groupOrder(legacy, 'A')) !== JSON.stringify(groupOrder(gameFirst, 'A')),
        'fixture phai cho thu hang KHAC NHAU giua hai chinh sach',
    );
}

// --------------------------------------------------------------------------
// 2. resolveTiebreak — thứ tự ưu tiên và tương thích legacy.
// --------------------------------------------------------------------------
{
    equal(resolveTiebreak({}, {}, {}).version, 'legacy_v2', 'mac dinh la legacy_v2');
    equal(
        resolveTiebreak({ tiebreak_policy: {} }, { tiebreak_override: null }, { config: {} }).version,
        'legacy_v2',
        'giai legacy thieu cau hinh ({} va null) van ra legacy_v2',
    );
    equal(
        resolveTiebreak({ tiebreak_policy: TIEBREAK_PRESETS.hieu_so_van_truoc }, {}, { config: {} }).version,
        'hieu_so_van_truoc',
        'chinh sach cap GIAI phai co hieu luc',
    );
    equal(
        resolveTiebreak(
            { tiebreak_policy: TIEBREAK_PRESETS.hieu_so_van_truoc },
            { tiebreak_override: TIEBREAK_PRESETS.giao_huu_clb },
            { config: {} },
        ).version,
        'giao_huu_clb',
        'override cap NOI DUNG thang chinh sach cap giai',
    );
    equal(
        resolveTiebreak(
            { tiebreak_policy: TIEBREAK_PRESETS.hieu_so_van_truoc },
            { tiebreak_override: TIEBREAK_PRESETS.giao_huu_clb },
            { config: { tiebreak: TIEBREAK_PRESETS.draw_lot } },
        ).version,
        'draw_lot',
        'snapshot cap GIAI DOAN thang tat ca (da chot luc boc tham)',
    );
    equal(
        resolveTiebreak(
            { tiebreak_policy: TIEBREAK_PRESETS.hieu_so_van_truoc },
            { tiebreak_override: {} },
            { config: { tiebreak: null } },
        ).version,
        'hieu_so_van_truoc',
        'override rong = ke thua, khong duoc che chinh sach cap giai',
    );
    equal(
        resolveTiebreak({ tiebreak_policy: 'hieu_so_van_truoc' }, {}, { config: {} }).order,
        TIEBREAK_PRESETS.hieu_so_van_truoc.order,
        'chuoi ten preset phai resolve dung, khong am tham roi ve legacy_v2',
    );
    equal(resolveTiebreak({}, {}, {}).scope, 'all', 'legacy_v2 giu scope all');
}

(async () => {
    // ----------------------------------------------------------------------
    // 3a. Lỗi đọc policy phải fail-closed, không được âm thầm dùng legacy_v2.
    // ----------------------------------------------------------------------
    for (const table of ['tournaments', 'tournament_divisions']) {
        await assert.rejects(
            () => standingsService.loadScoringContext(makeContextErrorDb(table), BASE_STAGE, GROUP_ID),
            (error) => error.code === 'SCORING_CONTEXT_READ_FAILED' && error.status === 500,
            `loi doc ${table} phai fail-closed`,
        );
        checks += 1;
    }

    // ----------------------------------------------------------------------
    // 3. computeStageStandings — chính sách phải tới được engine.
    // ----------------------------------------------------------------------
    {
        const db = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: null, tiebreak_policy: {} },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: null },
        });
        const result = await standingsService.computeStageStandings(db, Object.assign({}, BASE_STAGE), GROUP_ID);
        equal(groupOrder(result.standings, 'A'), LEGACY_ORDER_A, 'khong cau hinh gi -> legacy_v2');
        equal(result.tiebreak && result.tiebreak.version, 'legacy_v2', 'service phai tra chinh sach hieu luc');
    }

    {
        const db = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: null, tiebreak_policy: TIEBREAK_PRESETS.hieu_so_van_truoc },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: null },
        });
        const result = await standingsService.computeStageStandings(db, Object.assign({}, BASE_STAGE), GROUP_ID);
        equal(
            groupOrder(result.standings, 'A'),
            GAME_DIFF_ORDER_A,
            'tournament.tiebreak_policy phai doi duoc THU HANG THAT',
        );
        equal(result.tiebreak.version, 'hieu_so_van_truoc', 'chinh sach hieu luc tra ve dung');
        equal(groupOrder(result.standings, 'B'), [104, 105, 106], 'bang khong hoa khong doi khi doi chinh sach');
    }

    {
        const db = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: null, tiebreak_policy: TIEBREAK_PRESETS.legacy_v2 },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: TIEBREAK_PRESETS.hieu_so_van_truoc },
        });
        const result = await standingsService.computeStageStandings(db, Object.assign({}, BASE_STAGE), GROUP_ID);
        equal(
            groupOrder(result.standings, 'A'),
            GAME_DIFF_ORDER_A,
            'division.tiebreak_override phai thang tournament.tiebreak_policy o BXH that',
        );
    }

    {
        const db = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: null, tiebreak_policy: TIEBREAK_PRESETS.hieu_so_van_truoc },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: TIEBREAK_PRESETS.hieu_so_van_truoc },
        });
        const stage = Object.assign({}, BASE_STAGE, { config: { groupCount: 2, tiebreak: TIEBREAK_PRESETS.legacy_v2 } });
        const result = await standingsService.computeStageStandings(db, stage, GROUP_ID);
        equal(
            groupOrder(result.standings, 'A'),
            LEGACY_ORDER_A,
            'snapshot giai doan ghim chinh sach: doi cau hinh sau do khong duoc doi BXH',
        );
    }

    // ----------------------------------------------------------------------
    // 4. Suất tiến cấp dùng đúng chính sách đó.
    // ----------------------------------------------------------------------
    {
        const db = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: null, tiebreak_policy: {} },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: null },
        });
        const legacy = await standingsService.computeStageStandings(db, Object.assign({}, BASE_STAGE), GROUP_ID);
        const legacyQualifiers = roundRobin.advance({ config: { advancePerGroup: 2 } }, legacy.standings);

        const db2 = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: null, tiebreak_policy: TIEBREAK_PRESETS.hieu_so_van_truoc },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: null },
        });
        const gameFirst = await standingsService.computeStageStandings(db2, Object.assign({}, BASE_STAGE), GROUP_ID);
        const gameFirstQualifiers = roundRobin.advance({ config: { advancePerGroup: 2 } }, gameFirst.standings);

        const pick = (list, label, rank) => (list.find((row) => row.from_group === label && row.from_rank === rank) || {}).entrant_id;
        equal(pick(legacyQualifiers, 'A', 1), 102, 'A1 theo legacy_v2 la 102');
        equal(pick(gameFirstQualifiers, 'A', 1), 101, 'A1 theo hieu_so_van_truoc la 101 - suat thay doi');
        equal(pick(legacyQualifiers, 'A', 2), 101, 'A2 theo legacy_v2 la 101');
        equal(pick(gameFirstQualifiers, 'A', 2), 103, 'A2 theo hieu_so_van_truoc la 103 - suat thay doi');
        equal(pick(legacyQualifiers, 'B', 1), pick(gameFirstQualifiers, 'B', 1), 'bang B khong doi');
    }

    // ----------------------------------------------------------------------
    // 5. BO1/BO3 không regression.
    // ----------------------------------------------------------------------
    {
        // Cùng một bộ dữ liệu MỘT VÁN mỗi trận: BO1 phải coi là đã xong, BO3 thì
        // chưa. Nếu context luật điểm không tới engine thì BO1 rơi về BO3 và cả
        // bảng rỗng — đúng lỗi đã sửa ở round 2, không được tái phát.
        const bo1 = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: { best_of: 1 }, tiebreak_policy: {} },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: null },
            games: SINGLE_GAME_MATCHES,
        });
        const resultBo1 = await standingsService.computeStageStandings(bo1, Object.assign({}, BASE_STAGE), GROUP_ID);
        const rowsA1 = resultBo1.standings.filter((row) => (row.group_label || 'A') === 'A');
        check(rowsA1.every((row) => row.played === 2), 'BO1: moi doi bang A co du 2 tran da xong');
        check(rowsA1.every((row) => row.group_label === 'A'), 'BO1: group_label duoc gan day du');

        const bo3 = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: { best_of: 3 }, tiebreak_policy: {} },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: null },
            games: SINGLE_GAME_MATCHES,
        });
        const resultBo3 = await standingsService.computeStageStandings(bo3, Object.assign({}, BASE_STAGE), GROUP_ID);
        check(
            resultBo3.standings.every((row) => row.played === 0),
            'BO3 tren du lieu mot van: tran chua xong, khong doi nao duoc tinh',
        );

        // BO3 day du van giu ket qua doi chung (khong regression).
        const bo3Full = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: { best_of: 3 }, tiebreak_policy: {} },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: null },
        });
        const resultFull = await standingsService.computeStageStandings(bo3Full, Object.assign({}, BASE_STAGE), GROUP_ID);
        const rowsFull = resultFull.standings.filter((row) => (row.group_label || 'A') === 'A');
        // 3 tran bang A (2-0, 2-1, 2-1) = 2+3+3 van, moi van dem cho ca hai doi.
        const totalGamesA = rowsFull.reduce((sum, row) => sum + row.games_won + row.games_lost, 0);
        equal(totalGamesA, 16, 'BO3 day du: van thu 3 cua tran 2-1 duoc tinh');
        equal(groupOrder(resultFull.standings, 'A'), LEGACY_ORDER_A, 'BO3 giu nguyen ket qua doi chung');
    }

    // ----------------------------------------------------------------------
    // 6. Consumer không được resolve riêng một đường.
    // ----------------------------------------------------------------------
    {
        const standingsRoute = fs.readFileSync(path.join(ROOT, 'app/api/tournament-v2/standings/route.js'), 'utf8');
        check(
            !/resolveTiebreak\(\s*\{\s*\}\s*,\s*\{\s*\}\s*,/.test(standingsRoute),
            'route standings khong duoc goi resolveTiebreak({}, {}, stage) - no bo mat override',
        );
        check(
            /result\.tiebreak/.test(standingsRoute),
            'route standings phai dung chinh sach hieu luc do service tra ve',
        );

        const advanceRoute = fs.readFileSync(path.join(ROOT, 'app/api/tournament-v2/advance/route.js'), 'utf8');
        check(
            /stageWithResolvedTiebreak/.test(advanceRoute),
            'route advance phai tinh BXH bang stage da gan chinh sach hieu luc',
        );

        const publicRoute = fs.readFileSync(path.join(ROOT, 'app/api/tournament-v2/public/route.js'), 'utf8');
        const publicRead = fs.readFileSync(path.join(ROOT, 'lib/publicTournamentRead.js'), 'utf8');
        [
            ['app/api/tournament-v2/public/route.js', publicRoute],
            ['lib/publicTournamentRead.js', publicRead],
        ].forEach((pair) => {
            check(/tiebreak/.test(pair[1]), pair[0] + ' phai chieu chinh sach hieu luc ra snapshot cong khai');
        });
    }

    // ----------------------------------------------------------------------
    // 7. Nhãn hiển thị = chính sách đã dùng để tính.
    // ----------------------------------------------------------------------
    {
        const db = makeDb({
            tournament: { id: TOURNAMENT_ID, default_scoring: null, tiebreak_policy: TIEBREAK_PRESETS.hieu_so_van_truoc },
            division: { id: DIVISION_ID, scoring_override: null, tiebreak_override: null },
        });
        const result = await standingsService.computeStageStandings(db, Object.assign({}, BASE_STAGE), GROUP_ID);
        const fromRows = (result.standings[0].explanation.find((item) => item.criterion === 'order') || {}).order;
        equal(
            result.tiebreak.order,
            fromRows,
            'thu tu tieu chi tra cho UI phai TRUNG thu tu engine that su da dung',
        );
    }

    // ----------------------------------------------------------------------
    // 8. Guard E5 mở rộng: đổi chính sách sau khi đã seed bị chặn tại mutation boundary.
    // ----------------------------------------------------------------------
    {
        const migration = path.join(ROOT, 'database/migrations/084_guard_tiebreak_change_after_seed.sql');
        check(fs.existsSync(migration), 'phai co migration guard doi tie-break sau khi seed (084)');
        const sql = fs.readFileSync(migration, 'utf8');
        check(/TIEBREAK_CHANGE_BLOCKED_QUALIFICATION_SEEDED/.test(sql), 'guard phai raise ma loi rieng, de map 409');
        check(/PH409/.test(sql), 'guard phai dung ERRCODE PH409');
        check(/tournament_divisions/.test(sql) && /tournaments/.test(sql), 'guard phai phu ca hai tang cau hinh');
        check(/source_kind\s*=\s*'group_rank'/.test(sql), 'dieu kien chan phai bam dung suat hang-bang da seed');
        // Bo dong chu thich truoc khi soi: chu thich co the NHAC den DROP/TRUNCATE.
        const sqlStatements = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
        check(!/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(sqlStatements), 'migration khong duoc chua thao tac pha du lieu');

        const rulesRoute = fs.readFileSync(path.join(ROOT, 'app/api/tournament-v2/rules/route.js'), 'utf8');
        check(
            /PH409/.test(rulesRoute) && /409/.test(rulesRoute),
            'route rules phai map xung dot PH409 thanh HTTP 409 thay vi 500',
        );
    }

    console.log('unified-setup tiebreak policy end-to-end ok (' + checks + ' assertion)');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
