'use strict';

const SCORING_PRESETS = Object.freeze({
  legacy_v2: Object.freeze({ version: 'legacy_v2', points_to: 11, win_by: 1, cap: null, best_of: 3, win_points: 2, loss_points: 0, draw_points: 0, deciding_game: null, mlp: null }),
  phong_trao_11: Object.freeze({ version: 'phong_trao_11', points_to: 11, win_by: 2, cap: 15, best_of: 1, win_points: 2, loss_points: 0, draw_points: 0, deciding_game: null, mlp: null }),
  phong_trao_15: Object.freeze({ version: 'phong_trao_15', points_to: 15, win_by: 2, cap: 21, best_of: 1, win_points: 2, loss_points: 0, draw_points: 0, deciding_game: null, mlp: null }),
  ban_ket_chung_ket: Object.freeze({ version: 'ban_ket_chung_ket', points_to: 11, win_by: 2, cap: 15, best_of: 3, win_points: 2, loss_points: 0, draw_points: 0, deciding_game: { points_to: 11, win_by: 2, cap: 15 }, mlp: null }),
  mlp_4_van: Object.freeze({ version: 'mlp_4_van', points_to: 21, win_by: 2, cap: null, best_of: 4, win_points: 2, loss_points: 0, draw_points: 0, deciding_game: null, mlp: { sub_matches: 4, dreambreaker: true, dreambreaker_points_to: 21 } }),
  phong_trao_mac_dinh: Object.freeze({ version: 'phong_trao_mac_dinh', points_to: 11, win_by: 2, cap: 15, best_of: 3, win_points: 2, loss_points: 0, draw_points: 0, deciding_game: null, mlp: null }),
});

function resolveStageScoring(tournament = {}, division = {}, stage = {}) {
  const snapshot = stage.config?.scoring;
  const override = division.scoring_override;
  const tournamentDefault = tournament.default_scoring;
  const selected = snapshot || override || tournamentDefault || SCORING_PRESETS.legacy_v2;
  const version = selected.version || (snapshot ? 'stage_custom' : override ? 'division_custom' : tournamentDefault ? 'tournament_custom' : 'legacy_v2');
  return {
    ...SCORING_PRESETS.legacy_v2,
    ...selected,
    version,
    points_to: Number(selected.points_to ?? selected.pointsTo ?? 11),
    win_by: Number(selected.win_by ?? selected.winBy ?? 1),
    cap: selected.cap == null ? null : Number(selected.cap),
    best_of: Number(selected.best_of ?? selected.bestOf ?? 3),
    win_points: Number(selected.win_points ?? selected.winPoints ?? 2),
    loss_points: Number(selected.loss_points ?? selected.lossPoints ?? 0),
    draw_points: Number(selected.draw_points ?? selected.drawPoints ?? 0),
    deciding_game: selected.deciding_game ?? selected.decidingGame ?? null,
    mlp: selected.mlp ?? null,
    engine: {
      bestOf: Number(selected.best_of ?? selected.bestOf ?? 3),
      winPoints: Number(selected.win_points ?? selected.winPoints ?? 2),
      lossPoints: Number(selected.loss_points ?? selected.lossPoints ?? 0),
    },
  };
}

function validateGameScore(game = {}, scoring = {}, gameIndex = 0) {
  const a = Number(game.score_a);
  const b = Number(game.score_b);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) return { ok: false, code: 'INVALID_SCORE' };
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const cap = scoring.cap == null ? null : Number(scoring.cap);
  if (cap != null && high > cap) return { ok: false, code: 'SCORE_CAP_EXCEEDED' };
  const pointsTo = Number(scoring.points_to ?? 11);
  const winBy = Number(scoring.win_by ?? 1);
  const isCappedFinish = cap != null && high === cap;
  if (high < pointsTo) return { ok: false, code: 'POINTS_TO_NOT_REACHED' };
  if (!isCappedFinish && high - low < winBy) return { ok: false, code: 'WIN_BY_NOT_MET' };
  return { ok: true, code: null, game_index: gameIndex };
}

module.exports = { SCORING_PRESETS, resolveStageScoring, validateGameScore };
