// E2 regression: khi trận chung kết (F) CHƯA xong, không được coi người thắng
// BRONZE là nhà vô địch. BRONZE nằm cùng round với F nên fallback "trận đã xong ở
// vòng cao nhất" chọn nhầm BRONZE.
//
// Bao phủ: bronze xong trước final, final xong trước bronze, cả hai xong, cả hai
// chưa xong, không có bronze, và knockout legacy (không có match_key, có bye).
const { computeStandings, advance } = require('../../lib/tournament/engines/knockout');
const { finalStandingsFrom } = require('../../lib/tournament/qualification');

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) { console.error(`FAIL: ${msg}`); failed += 1; }
};
const entrants = [1, 2, 3, 4].map((id) => ({ id, name: 'E' + id, seed: id }));
const rankOf = (rows, id) => rows.find((r) => r.entrant_id === id)?.rank;

const SF1 = { match_key: 'SF1', round: 1, status: 'done', entrant_a_id: 1, entrant_b_id: 3, winner_entrant_id: 1 };
const SF2 = { match_key: 'SF2', round: 1, status: 'done', entrant_a_id: 2, entrant_b_id: 4, winner_entrant_id: 2 };
const F_PENDING = { match_key: 'F', round: 2, status: 'pending', entrant_a_id: 1, entrant_b_id: 2 };
const F_DONE = { match_key: 'F', round: 2, status: 'done', entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 2 };
const BRONZE_PENDING = { match_key: 'BRONZE', round: 2, status: 'pending', entrant_a_id: 3, entrant_b_id: 4 };
const BRONZE_DONE = { match_key: 'BRONZE', round: 2, status: 'done', entrant_a_id: 3, entrant_b_id: 4, winner_entrant_id: 3 };

/* 1. Bronze xong TRƯỚC final — đây là ca lỗi gốc. */
{
  const rows = computeStandings({ config: {} }, entrants, [SF1, SF2, F_PENDING, BRONZE_DONE]);
  assert(rankOf(rows, 3) !== 1, 'bronze xong trước final: người thắng bronze KHÔNG được là hạng 1');
  assert(rankOf(rows, 4) !== 2, 'bronze xong trước final: người thua bronze KHÔNG được là hạng 2');
  // Hai đội đang đá chung kết phải đứng trên cặp tranh hạng ba.
  assert(rankOf(rows, 1) < rankOf(rows, 3), 'finalist 1 phải đứng trên người thắng bronze');
  assert(rankOf(rows, 2) < rankOf(rows, 3), 'finalist 2 phải đứng trên người thắng bronze');
  assert(rankOf(rows, 3) < rankOf(rows, 4), 'người thắng bronze phải đứng trên người thua bronze');
  // Chưa có nhà vô địch xác định => không được advance ai cả.
  assert(advance({ config: {} }, rows).length === 0, 'final chưa xong thì advance() không trả nhà vô địch');
  // final_standings chỉ công bố khi chung kết đã xong.
  const fs = finalStandingsFrom({ schedule_format: 'knockout' }, [], [SF1, SF2, F_PENDING, BRONZE_DONE]);
  assert(fs.length === 0, 'final chưa xong thì finalStandingsFrom không công bố ngôi vô địch');
}

/* 2. Final xong TRƯỚC bronze. */
{
  const rows = computeStandings({ config: {} }, entrants, [SF1, SF2, F_DONE, BRONZE_PENDING]);
  assert(rankOf(rows, 2) === 1, 'final xong trước bronze: người thắng F là hạng 1');
  assert(rankOf(rows, 1) === 2, 'final xong trước bronze: người thua F là hạng 2');
  const champ = advance({ config: {} }, rows);
  assert(champ.length === 1 && champ[0].entrant_id === 2, 'advance trả đúng người thắng F');
}

/* 3. Cả hai đã xong. */
{
  const rows = computeStandings({ config: {} }, entrants, [SF1, SF2, F_DONE, BRONZE_DONE]);
  assert(rows.map((r) => r.entrant_id).join(',') === '2,1,3,4', 'cả hai xong: thứ tự 2,1,3,4');
  assert(rows.map((r) => r.rank).join(',') === '1,2,3,4', 'cả hai xong: hạng 1..4 riêng biệt');
  const fs = finalStandingsFrom({ schedule_format: 'knockout' }, [], [SF1, SF2, F_DONE, BRONZE_DONE]);
  assert(fs[0].entry_id === 2 && fs[0].rank === 1, 'BXH chung cuộc: vô địch là người thắng F');
  assert(fs[2].entry_id === 3 && fs[2].rank === 3, 'BXH chung cuộc: hạng ba là người thắng BRONZE');
  assert(fs[3].entry_id === 4 && fs[3].rank === 4, 'BXH chung cuộc: hạng tư là người thua BRONZE');
}

/* 4. Cả hai chưa xong. */
{
  const rows = computeStandings({ config: {} }, entrants, [SF1, SF2, F_PENDING, BRONZE_PENDING]);
  assert(advance({ config: {} }, rows).length === 0, 'chưa đá F lẫn BRONZE thì không có nhà vô địch');
  assert(finalStandingsFrom({ schedule_format: 'knockout' }, [], [SF1, SF2, F_PENDING, BRONZE_PENDING]).length === 0,
    'chưa xong thì không có BXH chung cuộc');
}

/* 5. Không có bronze: hai đội thua bán kết đồng hạng ba khi giải hoàn tất. */
{
  const rows = computeStandings({ config: {} }, entrants, [SF1, SF2, F_DONE]);
  assert(rankOf(rows, 2) === 1 && rankOf(rows, 1) === 2, 'không bronze: vô địch/á quân đúng');
  assert(rankOf(rows, 3) === 3 && rankOf(rows, 4) === 3, 'không bronze: hai đội thua bán kết đồng hạng ba');
  const fs = finalStandingsFrom({ schedule_format: 'knockout' }, [], [SF1, SF2, F_DONE]);
  assert(fs.filter((r) => r.placement === 'joint_third').length === 2, 'không bronze: BXH có hai đồng hạng ba');
}

/* 6. Knockout legacy: không có match_key, có bye — phải giữ nguyên hành vi cũ. */
{
  const legacy = [
    { round: 1, slot: 0, entrant_a_id: 1, entrant_b_id: 4, winner_entrant_id: 1, status: 'done' },
    { round: 1, slot: 1, entrant_a_id: 3, entrant_b_id: 2, winner_entrant_id: 2, status: 'done' },
    { round: 2, slot: 2, entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, status: 'done' },
  ];
  const rows = computeStandings({ config: {} }, entrants, legacy);
  assert(rankOf(rows, 1) === 1 && rankOf(rows, 2) === 2, 'legacy: vô địch/á quân giữ nguyên');
  assert(advance({ config: {} }, rows)[0].entrant_id === 1, 'legacy: advance vẫn trả nhà vô địch');

  // Bye: một đội vào thẳng chung kết, không có trận vòng 1.
  const bye = [
    { round: 1, slot: 0, entrant_a_id: 1, entrant_b_id: 4, winner_entrant_id: 1, status: 'done' },
    { round: 2, slot: 2, entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 2, status: 'done' },
  ];
  const byeRows = computeStandings({ config: {} }, [1, 2, 4].map((id) => ({ id, seed: id })), bye);
  assert(byeRows[0].entrant_id === 2 && byeRows[0].rank === 1, 'legacy bye: vô địch đúng');
}

/* 7. buildResolvedMatches phải GIỮ round + match_key.
   Nếu bị lược bỏ thì maxRound = NaN và toàn bộ xếp hạng knockout sai; đồng thời
   keyedFinal/keyedBronze luôn undefined nên bản vá bronze/final ở trên vô hiệu
   khi đi qua standingsService. */
{
  const { buildResolvedMatches } = require('../../lib/tournament/results');
  const simple = require('../../lib/tournament/match/simple');
  const raw = [
    { id: 71, match_key: 'SF1', round: 1, status: 'done', entrant_a_id: 1, entrant_b_id: 3 },
    { id: 72, match_key: 'SF2', round: 1, status: 'done', entrant_a_id: 2, entrant_b_id: 4 },
    { id: 73, match_key: 'F', round: 2, status: 'done', entrant_a_id: 1, entrant_b_id: 2 },
    { id: 74, match_key: 'BRONZE', round: 2, status: 'done', entrant_a_id: 3, entrant_b_id: 4 },
  ];
  const games = {
    71: [{ score_a: 11, score_b: 5 }], 72: [{ score_a: 11, score_b: 5 }],
    73: [{ score_a: 5, score_b: 11 }], 74: [{ score_a: 11, score_b: 5 }],
  };
  const resolved = buildResolvedMatches(raw, games, simple, { bestOf: 1 });
  assert(resolved.every((m) => Number.isInteger(m.round)), 'resolved phải giữ round');
  assert(resolved.map((m) => m.match_key).join(',') === 'SF1,SF2,F,BRONZE', 'resolved phải giữ match_key');
  const maxRound = resolved.reduce((mx, m) => Math.max(mx, m.round), 0);
  assert(Number.isFinite(maxRound) && maxRound === 2, 'maxRound tính được từ resolved (không NaN)');
  const rows = computeStandings({ config: {} }, [1, 2, 3, 4].map((id) => ({ id, seed: id })), resolved);
  assert(rankOf(rows, 2) === 1, 'từ resolved: người thắng F là hạng 1');
  assert(rankOf(rows, 1) === 2, 'từ resolved: người thua F là hạng 2');
  assert(rankOf(rows, 3) === 3, 'từ resolved: người thắng BRONZE là hạng 3');
  assert(rankOf(rows, 4) === 4, 'từ resolved: người thua BRONZE là hạng 4');
}

if (failed) { console.error(`knockout-bronze-final: ${failed} assertion(s) failed`); process.exit(1); }
console.log('knockout-bronze-final ok');
