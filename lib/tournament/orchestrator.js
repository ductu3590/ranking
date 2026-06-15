// lib/tournament/orchestrator.js
const { getScheduleEngine } = require('./engines');

function isStageComplete(matches) {
  return matches.length > 0 && matches.every((m) => m.status === 'done');
}
function seedNextStage(stage, standings) {
  const engine = getScheduleEngine(stage.schedule_format);
  const advanced = engine.advance(stage, standings);
  // Chuẩn hóa: thêm id + seed để generateSchedule stage kế dùng trực tiếp,
  // vẫn giữ entrant_id + seed_in_stage để API lưu vào tournament_stage_entrants.
  return advanced.map((row) => ({
    ...row,
    id: row.entrant_id,
    seed: row.seed_in_stage,
  }));
}
module.exports = { isStageComplete, seedNextStage };
