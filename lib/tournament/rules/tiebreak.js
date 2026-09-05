'use strict';

const TIEBREAK_PRESETS = Object.freeze({
  legacy_v2: Object.freeze({ version: 'legacy_v2', scope: 'global', order: ['match_points', 'diff', 'head_to_head', 'points_for', 'seed'] }),
  phong_trao_mac_dinh: Object.freeze({ version: 'phong_trao_mac_dinh', scope: 'global', order: ['match_points', 'diff', 'points_for', 'seed'] }),
  hieu_so_van_truoc: Object.freeze({ version: 'hieu_so_van_truoc', scope: 'global', order: ['match_points', 'games_diff', 'diff', 'seed'] }),
  giao_huu_clb: Object.freeze({ version: 'giao_huu_clb', scope: 'global', order: ['match_points', 'diff', 'points_for', 'seed'] }),
  draw_lot: Object.freeze({ version: 'draw_lot', scope: 'draw_lot', order: ['match_points', 'diff', 'points_for'] }),
});

function resolveTiebreak(tournament = {}, division = {}, stage = {}) {
  const selected = stage.config?.tiebreak || division.tiebreak_override || tournament.tiebreak_policy || TIEBREAK_PRESETS.legacy_v2;
  return { ...TIEBREAK_PRESETS.legacy_v2, ...selected, version: selected.version || 'legacy_v2' };
}

function seededOrder(items, seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  return items.slice().sort(() => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 4294967296) - 0.5;
  });
}

function rankStandings(rows = [], matches = [], policy = TIEBREAK_PRESETS.legacy_v2, seed = 1) {
  const selected = typeof policy === 'string' ? TIEBREAK_PRESETS[policy] : policy;
  const config = selected || TIEBREAK_PRESETS.legacy_v2;
  const headToHead = new Map();
  for (const match of matches || []) {
    if (match.status !== 'done' || !match.winner_entrant_id) continue;
    const key = [match.entrant_a_id, match.entrant_b_id].sort((a, b) => Number(a) - Number(b)).join('-');
    headToHead.set(key, match.winner_entrant_id);
  }
  const explanation = (row) => [{ criterion: 'policy', value: config.version || 'legacy_v2' }, { criterion: 'ranked_by', value: ['match_points', 'diff', 'head_to_head', 'points_for', 'seed'] }];
  const compare = (a, b) => {
    const groupOrder = String(a.group_label || 'A').localeCompare(String(b.group_label || 'A'));
    if (groupOrder) return groupOrder;
    for (const criterion of config.order || TIEBREAK_PRESETS.legacy_v2.order) {
      if (criterion === 'head_to_head') {
        const winner = headToHead.get([a.entrant_id, b.entrant_id].sort((x, y) => Number(x) - Number(y)).join('-'));
        if (winner && String(winner) !== String(a.entrant_id) && String(winner) !== String(b.entrant_id)) continue;
        if (winner) return String(winner) === String(a.entrant_id) ? -1 : 1;
        continue;
      }
      const av = Number(a[criterion] ?? 0); const bv = Number(b[criterion] ?? 0);
      if (av !== bv) return bv - av;
    }
    return Number(a.entrant_id) - Number(b.entrant_id);
  };
  const output = rows.map((row) => ({ ...row, explanation: explanation(row) }));
  if (config.scope === 'draw_lot' || config.version === 'draw_lot') {
    const grouped = new Map();
    output.forEach((row) => { const key = `${row.match_points ?? 0}:${row.diff ?? 0}:${row.points_for ?? 0}`; (grouped.get(key) || grouped.set(key, []).get(key)).push(row); });
    for (const group of grouped.values()) if (group.length > 1) {
      const ordered = seededOrder(group, seed);
      ordered.forEach((row, index) => { row._draw_lot_order = index; });
    }
  }
  output.sort((a, b) => (a._draw_lot_order != null && b._draw_lot_order != null ? a._draw_lot_order - b._draw_lot_order : compare(a, b)));
  const byGroup = new Map();
  output.forEach((row) => { const key = row.group_label || 'A'; (byGroup.get(key) || byGroup.set(key, []).get(key)).push(row); });
  for (const group of byGroup.values()) group.forEach((row, index) => { row.rank = index + 1; delete row._draw_lot_order; });
  return output;
}

module.exports = { TIEBREAK_PRESETS, resolveTiebreak, rankStandings };
