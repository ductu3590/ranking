'use strict';

const TIEBREAK_PRESETS = Object.freeze({
  legacy_v2: Object.freeze({ version: 'legacy_v2', scope: 'all', order: ['match_points', 'diff', 'head_to_head', 'points_for', 'seed'] }),
  phong_trao_mac_dinh: Object.freeze({ version: 'phong_trao_mac_dinh', scope: 'tied_group', order: ['match_points', 'head_to_head', 'game_diff', 'point_diff', 'points_for', 'draw_lot'] }),
  hieu_so_van_truoc: Object.freeze({ version: 'hieu_so_van_truoc', scope: 'tied_group', order: ['match_points', 'game_diff', 'head_to_head', 'point_diff', 'draw_lot'] }),
  giao_huu_clb: Object.freeze({ version: 'giao_huu_clb', scope: 'all', order: ['match_points', 'point_diff', 'points_for', 'head_to_head', 'draw_lot'] }),
  draw_lot: Object.freeze({ version: 'draw_lot', scope: 'all', order: ['match_points', 'draw_lot'] }),
});

function resolveTiebreak(tournament = {}, division = {}, stage = {}) {
  const selected = stage.config?.tiebreak || division.tiebreak_override || tournament.tiebreak_policy || TIEBREAK_PRESETS.legacy_v2;
  return { ...TIEBREAK_PRESETS.legacy_v2, ...selected, version: selected.version || 'legacy_v2', scope: selected.scope === 'tied_group' ? 'tied_group' : 'all' };
}

function seededShuffle(items, seed = 1) {
  const output = items.slice(); let state = (Number(seed) || 1) >>> 0;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = Math.floor((state / 4294967296) * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function buildHeadToHead(matches) {
  const result = new Map();
  for (const match of matches || []) {
    if (match.status !== 'done' || !match.winner_entrant_id) continue;
    const key = [match.entrant_a_id, match.entrant_b_id].sort((a, b) => Number(a) - Number(b)).join('-');
    result.set(key, match.winner_entrant_id);
  }
  return result;
}

function headToHeadValues(group, matches) {
  const ids = new Set(group.map((row) => String(row.entrant_id)));
  const values = new Map(group.map((row) => [String(row.entrant_id), 0]));
  for (const match of matches || []) {
    const a = String(match.entrant_a_id); const b = String(match.entrant_b_id); const winner = String(match.winner_entrant_id);
    if (match.status === 'done' && ids.has(a) && ids.has(b) && ids.has(winner)) values.set(winner, values.get(winner) + 1);
  }
  return values;
}

function valueFor(row, criterion, h2h) {
  if (criterion === 'head_to_head') return h2h.get(String(row.entrant_id)) || 0;
  if (criterion === 'points_against') return -(Number(row.points_against ?? 0));
  return Number(row[criterion] ?? 0);
}

function rankStandings(rows = [], matches = [], policy = TIEBREAK_PRESETS.legacy_v2, seed = 1) {
  const requested = typeof policy === 'string' ? TIEBREAK_PRESETS[policy] : policy;
  const config = requested?.version && TIEBREAK_PRESETS[requested.version]
    ? { ...TIEBREAK_PRESETS[requested.version], ...requested }
    : requested || TIEBREAK_PRESETS.legacy_v2;
  const order = Array.isArray(config.order) ? config.order : TIEBREAK_PRESETS.legacy_v2.order;
  const base = rows.map((row) => ({ ...row, explanation: [{ criterion: 'policy', value: config.version || 'legacy_v2' }, { criterion: 'order', order: order.slice() }] }));

  function rankGroup(group, criteria = order) {
    if (group.length <= 1) return group.map((row) => ({ row, criterion: null, decided: false }));
    for (const criterion of criteria) {
      if (criterion === 'draw_lot') {
        group.forEach((row) => row.explanation.push({ criterion, considered: true, decided: true }));
        return seededShuffle(group, seed).map((row) => ({ row, criterion: null, decided: false }));
      }
      group.forEach((row) => row.explanation.push({ criterion, considered: true, decided: false }));
      const h2h = criterion === 'head_to_head' ? headToHeadValues(group, matches) : new Map();
      const buckets = new Map();
      for (const row of group) {
        const value = valueFor(row, criterion, h2h); const key = String(value);
        if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(row);
      }
      if (buckets.size <= 1) continue;
      group.forEach((row) => { const item = row.explanation.slice().reverse().find((entry) => entry.criterion === criterion && entry.considered); if (item) item.decided = true; });
      const result = [];
      for (const [, bucket] of [...buckets.entries()].sort((a, b) => Number(b[0]) - Number(a[0]))) {
        if (bucket.length === 1) result.push({ row: bucket[0], criterion, decided: true });
        else result.push(...rankGroup(bucket, order));
      }
      return result;
    }
    return seededShuffle(group, seed).map((row) => ({ row, criterion: 'draw_lot', decided: true }));
  }

  const groups = new Map();
  for (const row of base) { const key = row.group_label || 'A'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  const output = [];
  for (const group of groups.values()) {
    for (const item of rankGroup(group)) {
      output.push(item.row);
    }
  }
  const byGroup = new Map();
  for (const row of output) { const key = row.group_label || 'A'; if (!byGroup.has(key)) byGroup.set(key, []); byGroup.get(key).push(row); }
  for (const group of byGroup.values()) group.forEach((row, index) => { row.rank = index + 1; });
  return output;
}

module.exports = { TIEBREAK_PRESETS, resolveTiebreak, rankStandings, seededShuffle };
