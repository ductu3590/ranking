'use strict';

const SCOPES = ['internal', 'friendly', 'community'];
const UNITS = ['don', 'doi', 'team'];
const FORMATS = ['rr', 'se', 'de', 'mix'];

function unitToEntrantType(unit) {
  return unit === 'don' ? 'individual' : unit === 'team' ? 'team' : 'pair';
}

function effectiveScoring({ unit, scope, userScoring } = {}) {
  if (unit === 'team') return 'team';
  if (scope !== 'internal' && userScoring === 'club') return 'club';
  return 'individual';
}

function scoringScopeForDb(eff) {
  return eff === 'individual' ? 'athlete' : 'club';
}

function defaultConfigForScope(scope) {
  const base = { unit: 'doi', userScoring: 'individual', fmt: 'rr', bestOf: 1, teamSize: 4, subGames: 5, teamCount: 2 };
  if (scope === 'friendly') return { ...base, userScoring: 'club' };
  if (scope === 'community') return { ...base, userScoring: 'club' };
  return base;
}

function scheduleFromFormat(fmt) {
  if (fmt === 'rr') return { schedule_format: 'round_robin', group_count: 1 };
  if (fmt === 'mix') return { schedule_format: 'round_robin', group_count: 2 };
  if (fmt === 'se') return { schedule_format: 'knockout', double_elimination: false };
  return { schedule_format: 'knockout', double_elimination: true, engine_pending: true };
}

function resolveCompetition(input = {}) {
  const { scope, unit, fmt } = input;
  if (!SCOPES.includes(scope)) throw new Error('INVALID_SCOPE');
  if (!UNITS.includes(unit)) throw new Error('INVALID_UNIT');
  if (!FORMATS.includes(fmt)) throw new Error('INVALID_FORMAT');
  const eff = effectiveScoring(input);
  const sched = scheduleFromFormat(fmt);
  const out = {
    play_type: unitToEntrantType(unit),
    entrant_type: unitToEntrantType(unit),
    scoring_scope: scoringScopeForDb(eff),
    scoring_display: eff,
    best_of: unit === 'team' ? null : Number(input.bestOf || 1),
    double_elimination: !!sched.double_elimination,
    engine_pending: !!sched.engine_pending,
    schedule_format: sched.schedule_format,
    group_count: sched.group_count || 1,
  };
  if (unit === 'team') out.team = { size: Number(input.teamSize || 4), sub_games: Number(input.subGames || 5), count: Number(input.teamCount || 2) };
  return out;
}

function describeCombo({ unit, scope, userScoring, subGames = 5, bestOf = 1 } = {}) {
  if (unit === 'team') {
    return scope === 'internal'
      ? 'Trận đội (MLP). Chia thành viên CLB thành nhiều đội; hai đội gặp nhau đánh ' + subGames + ' ván con.'
      : 'Trận đội (MLP) — mỗi CLB một đội. Hai CLB gặp nhau đánh ' + subGames + ' ván con.';
  }
  const u = unit === 'don' ? 'Đánh đơn' : 'Đánh đôi';
  if (effectiveScoring({ unit, scope, userScoring }) === 'club') {
    return u + ', cộng điểm về CLB. Các ' + (unit === 'don' ? 'VĐV' : 'cặp') + ' đấu bình thường; thắng thua dồn về CLB, tổng sắp.';
  }
  return u + ', xếp hạng cá nhân. Mỗi trận đánh ' + (bestOf === 1 ? '1 ván' : 'best of ' + bestOf) + '.';
}

module.exports = {
  SCOPES, UNITS, FORMATS,
  unitToEntrantType, effectiveScoring, scoringScopeForDb,
  defaultConfigForScope, scheduleFromFormat, resolveCompetition, describeCombo,
};
