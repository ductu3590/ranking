// lib/tournament/results.js
// Helper thuần cho nhập kết quả & gom dữ liệu BXH. Không I/O.
function advanceWinner(match) {
  if (!match || !match.parent_match_id || !match.winner_entrant_id) return null;
  const field = match.bracket_slot % 2 === 0 ? 'entrant_a_id' : 'entrant_b_id';
  return { parent_match_id: match.parent_match_id, field, entrant_id: match.winner_entrant_id };
}

// config có thể là một object dùng chung, hoặc một hàm (match) => config —
// cần dạng hàm vì mỗi vòng có thể có số ván khác nhau.
function buildResolvedMatches(matches, gamesByMatchId, matchEngine, config = {}) {
  const configOf = typeof config === 'function' ? config : () => config;
  const FINISHED = new Set(['done', 'finalized']);
  return matches.map((m) => {
    const games = gamesByMatchId[m.id] || [];
    const r = matchEngine.resolveMatch(
      { entrant_a_id: m.entrant_a_id, entrant_b_id: m.entrant_b_id },
      games,
      configOf(m),
    );
    // DB dùng 'finalized'; các engine dùng 'done' làm từ vựng nội bộ. Chấp nhận
    // cả hai ở đây để không phụ thuộc việc nơi gọi có dịch trước hay không.
    const done = FINISHED.has(m.status) && r.complete;
    return {
      id: m.id,
      entrant_a_id: m.entrant_a_id,
      entrant_b_id: m.entrant_b_id,
      group_label: m.group_label != null ? m.group_label : null,
      status: m.status,
      winner_entrant_id: done ? r.winner_entrant_id : null,
      points_a: r.points_a, points_b: r.points_b,
      games_a: r.games_a, games_b: r.games_b,
    };
  });
}

module.exports = { advanceWinner, buildResolvedMatches };
