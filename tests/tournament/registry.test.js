const { getScheduleEngine, getMatchEngine } = require('../../lib/tournament/engines');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
assert(typeof getScheduleEngine('round_robin').generateSchedule === 'function', 'round_robin engine');
assert(typeof getScheduleEngine('knockout').generateSchedule === 'function', 'knockout engine');
assert(typeof getMatchEngine('simple').resolveMatch === 'function', 'simple match');
assert(typeof getMatchEngine('mlp').resolveMatch === 'function', 'mlp match');
let threw = false;
try { getScheduleEngine('xyz'); } catch (e) { threw = true; }
assert(threw, 'format lạ -> ném lỗi');
console.log('registry ok');
