// Chốt 1 trận ĐỘI cấu hình được (mở rộng tổng quát của MLP).
// Cấu hình: số người mỗi đội (teamSize, metadata) và số ván con mỗi trận đội (subGames).
// Cộng ván con thắng; hòa -> Dreambreaker (nếu bật). Không clinch sớm: chơi đủ ván con.
// Nguồn chân lý tổng ván con: pairSchedule.subKinds → config.subMatches → config.subGames → mặc định 5.
function resolveMatch(match, games, config = {}) {
  const pairSubKinds = config.pairSchedule?.subKinds;
  const subCount = pairSubKinds?.length ? pairSubKinds.length
    : config.subMatches?.length ? config.subMatches.length
    : Number(config.subGames) || 5;
  const useDreambreaker = config.dreambreaker !== false;
  let winsA = 0, winsB = 0, pointsA = 0, pointsB = 0;
  let dbWinner = null;
  for (const g of games) {
    const a = Number(g.score_a) || 0;
    const b = Number(g.score_b) || 0;
    pointsA += a; pointsB += b;
    if (g.kind === 'dreambreaker') {
      dbWinner = a > b ? match.entrant_a_id : (b > a ? match.entrant_b_id : null);
      continue;
    }
    if (a > b) winsA++; else if (b > a) winsB++;
  }
  const playedSubs = winsA + winsB;
  const allSubsDone = playedSubs >= subCount;
  let winner = null, complete = false;
  if (allSubsDone && winsA !== winsB) {
    winner = winsA > winsB ? match.entrant_a_id : match.entrant_b_id;
    complete = true;
  } else if (allSubsDone && winsA === winsB && useDreambreaker && dbWinner) {
    winner = dbWinner;
    complete = true;
  }
  return { winner_entrant_id: winner, games_a: winsA, games_b: winsB, points_a: pointsA, points_b: pointsB, complete };
}
module.exports = { resolveMatch };
