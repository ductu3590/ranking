const { seedOrder } = require('../../lib/tournament/seeding');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}`);
eq(seedOrder(2), [1, 2], 'B=2');
eq(seedOrder(4), [1, 4, 3, 2], 'B=4');
eq(seedOrder(8), [1, 8, 5, 4, 3, 6, 7, 2], 'B=8');
assert(seedOrder(16).length === 16 && seedOrder(16)[0] === 1 && seedOrder(16)[1] === 16, 'B=16 đầu/cuối');
console.log('seeding ok');
