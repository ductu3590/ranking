// Chốt 1 trận best-of-N ván. games: [{score_a, score_b}].
function resolveMatch(match, games, config = {}) {
  const bestOf = config.bestOf || 3;
  const needed = Math.floor(bestOf / 2) + 1;
  let gamesA = 0, gamesB = 0, pointsA = 0, pointsB = 0;
  for (const g of games) {
    const a = Number(g.score_a) || 0;
    const b = Number(g.score_b) || 0;
    pointsA += a; pointsB += b;
    if (a > b) gamesA++; else if (b > a) gamesB++;
  }
  const complete = gamesA >= needed || gamesB >= needed;
  let winner = null;
  if (complete) winner = gamesA > gamesB ? match.entrant_a_id : match.entrant_b_id;
  return { winner_entrant_id: winner, games_a: gamesA, games_b: gamesB, points_a: pointsA, points_b: pointsB, complete };
}
module.exports = { resolveMatch };
