// lib/tournament/orchestrator.js
const { getScheduleEngine } = require('./engines');

function isStageComplete(matches) {
  return matches.length > 0 && matches.every((m) => m.status === 'done');
}
function seedNextStage(stage, standings) {
  const engine = getScheduleEngine(stage.schedule_format);
  return engine.advance(stage, standings);
}
module.exports = { isStageComplete, seedNextStage };
