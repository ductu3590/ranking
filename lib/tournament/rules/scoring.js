'use strict';

const SCORING_PRESETS = Object.freeze({
  legacy_v2: Object.freeze({ version: 'legacy_v2', points_to: 11, win_by: 1, cap: null, best_of: 3, win_points: 2, loss_points: 0 }),
  phong_trao_mac_dinh: Object.freeze({ version: 'phong_trao_mac_dinh', points_to: 11, win_by: 2, cap: 15, best_of: 3, win_points: 2, loss_points: 0 }),
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
