const assert = require('assert');
const {
  SCOPES, UNITS, FORMATS,
  effectiveScoring, unitToEntrantType, defaultConfigForScope,
  resolveCompetition, describeCombo,
} = require('../../lib/tournament/wizardConfig');

assert.strictEqual(effectiveScoring({ unit: 'team', scope: 'internal', userScoring: 'individual' }), 'team', 'đơn vị đội -> tính theo đội');
assert.strictEqual(effectiveScoring({ unit: 'doi', scope: 'friendly', userScoring: 'club' }), 'club', 'giao hữu + chọn CLB -> cộng điểm CLB');
assert.strictEqual(effectiveScoring({ unit: 'doi', scope: 'internal', userScoring: 'club' }), 'individual', 'nội bộ đơn/đôi -> cá nhân (CLB không có nghĩa)');

assert.strictEqual(unitToEntrantType('don'), 'individual');
assert.strictEqual(unitToEntrantType('doi'), 'pair');
assert.strictEqual(unitToEntrantType('team'), 'team');

const di = defaultConfigForScope('internal');
assert.strictEqual(di.unit, 'doi'); assert.strictEqual(di.fmt, 'rr'); assert.strictEqual(di.bestOf, 1);

const r = resolveCompetition({ scope: 'internal', unit: 'team', userScoring: 'individual', fmt: 'mix', bestOf: 3, teamSize: 4, subGames: 5 });
assert.strictEqual(r.play_type, 'team');
assert.strictEqual(r.scoring_scope, 'club');
assert.strictEqual(r.schedule_format, 'round_robin');
assert.strictEqual(r.group_count, 2, 'mix -> vòng bảng 2 nhóm');
assert.strictEqual(r.team.size, 4);
assert.strictEqual(r.team.sub_games, 5);

const rd = resolveCompetition({ scope: 'internal', unit: 'doi', userScoring: 'individual', fmt: 'de', bestOf: 1 });
assert.strictEqual(rd.schedule_format, 'knockout');
assert.strictEqual(rd.double_elimination, true);
assert.strictEqual(rd.engine_pending, true, 'double elim chưa có engine');

for (const unit of ['don','doi','team']) for (const scope of ['internal','friendly']) {
  assert(describeCombo({ unit, scope, userScoring: 'individual' }).length > 0, 'mô tả combo '+unit+'/'+scope);
}
console.log('phase3 wizard config ok');
