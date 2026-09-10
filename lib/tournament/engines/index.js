// lib/tournament/engines/index.js
const roundRobin = require('./roundRobin');
const knockout = require('./knockout');
const doubleElim = require('./doubleElim');
const simple = require('../match/simple');
const mlp = require('../match/mlp');
const team = require('../match/team');

const SCHEDULE = { round_robin: roundRobin, knockout, double_elim: doubleElim };
const MATCH = { simple, mlp, team };

function getScheduleEngine(format) {
  const e = SCHEDULE[format];
  if (!e) throw new Error(`Unknown schedule_format: ${format}`);
  return e;
}
function getMatchEngine(format) {
  const e = MATCH[format];
  if (!e) throw new Error(`Unknown match_format: ${format}`);
  return e;
}
module.exports = { getScheduleEngine, getMatchEngine };
