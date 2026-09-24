'use strict';
// Epic 2 E1 §4, §6: hợp đồng các route ghi/đọc của mục Điều hành (đọc mã nguồn, không gọi DB).

const { read, exists, assert, suite } = require('../_harness');

const games = read('app/api/tournament-v2/games/route.js');
const withdraw = read('app/api/tournament-v2/withdraw/route.js');
const transition = read('app/api/tournament-v2/match-transition/route.js');
const operations = exists('app/api/tournament-v2/operations/route.js') ? read('app/api/tournament-v2/operations/route.js') : '';

suite('epic-2 · api contract', {
  'games: chặn trước RPC bằng assertScoreSavable (sớm + sau khi resolve)': () => {
    const rpcAt = games.indexOf("db.rpc('replace_tournament_games_with_transitions'");
    const guards = [...games.matchAll(/assertScoreSavable\(/g)].map((match) => match.index);
    assert.ok(rpcAt > 0);
    assert.equal(guards.length, 2);
    assert.ok(guards.every((index) => index < rpcAt), 'mọi chặn đứng trước RPC');
  },
  'games: lưu dở giữ trạng thái, chốt vẫn ghi finalized': () => {
    assert.match(games, /p_status:\s*resolved\.complete\s*\?\s*'finalized'\s*:\s*statusForSave\(match, false\)/);
  },
  'games: phân loại lỗi theo message (classifyRpcConflict), không gộp theo mã': () => {
    assert.match(games, /classifyRpcConflict\(error\)/);
    assert.doesNotMatch(games, /CONFLICT_CODES\.includes\(code\)\s*\?\s*'Dữ liệu trận đã thay đổi/);
  },
  'games: ended_at bằng UPDATE có điều kiện, không started_at, không result_type': () => {
    const stamp = games.slice(games.indexOf('async function stampEndedAt'), games.indexOf('async function stampEndedAt') + 700);
    for (const needle of [".eq('status', 'finalized')", ".eq('version', Number(version))", ".is('ended_at', null)", "ended_at: new Date().toISOString()"]) {
      assert.ok(stamp.includes(needle), needle);
    }
    assert.doesNotMatch(stamp, /version:\s*/, 'không ghi version');
    assert.doesNotMatch(games, /started_at:/);
    assert.doesNotMatch(games, /result_type:\s*['"]/);
  },
  'withdraw: RPC 096, kiểm trạng thái theo loại, action theo kind, need write': () => {
    assert.match(withdraw, /db\.rpc\('withdraw_tournament_match_walkover'/);
    assert.match(withdraw, /assertWithdrawAllowed\(\{ match: probe\.data, kind \}\)/);
    assert.ok(withdraw.indexOf('assertWithdrawAllowed(') < withdraw.indexOf("db.rpc('withdraw_tournament_match_walkover'"));
    assert.match(withdraw, /action: verdict\.action/);
    assert.match(withdraw, /need: 'write'/);
    assert.doesNotMatch(withdraw, /update\(\{\s*result_type/, 'không UPDATE result_type ngoài RPC');
    assert.match(withdraw, /\.is\('ended_at', null\)/);
  },
  'match-transition: từ chối đích finalized; gọi sân kiểm cặp/sân bận': () => {
    assert.match(transition, /if \(to === 'finalized'\)[^\n]*USE_SCORE_ENTRY/);
    for (const code of ['MATCH_NOT_READY', 'ENTRY_BUSY', 'COURT_BUSY']) assert.ok(transition.includes(code), code);
    assert.ok(transition.indexOf("to === 'finalized'") < transition.indexOf('canTransitionMatch(matchResult'));
    assert.match(transition, /need: 'write'/);
  },
  'operations: route đọc, scope group_id, gọi builder thuần, không select cột nhạy cảm': () => {
    assert.ok(operations, 'có route operations');
    assert.match(operations, /requireTournamentAccess\(\{ tournamentId, need: 'read' \}\)/);
    assert.ok((operations.match(/\.eq\('group_id', groupId\)/g) || []).length >= 8, 'mọi truy vấn scope group_id');
    assert.match(operations, /buildOperationsBoard\(/);
    const selects = [...operations.matchAll(/select\('([^']*)'\)|MATCH_SELECT = '([^']*)'/g)].map((match) => match[1] ?? match[2]);
    assert.ok(selects.length >= 8);
    for (const columns of selects) assert.doesNotMatch(columns, /^\*$|phone|email|token|member_id/, columns);
    assert.match(operations, /select\('id, name_snapshot'\)/);
  },
  'client: getOperationsBoard + withdrawMatch có idempotency key': () => {
    const client = read('lib/tournamentV2Client.js');
    assert.match(client, /export function getOperationsBoard/);
    assert.match(client, /request\('\/withdraw'[\s\S]{0,160}idempotency_key/);
  },
});
