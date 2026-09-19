'use strict';

const assert = require('node:assert/strict');
const { fixtures } = require('./fixtures');

assert.equal(fixtures.fourteen.athletes.length, 14);
assert.equal(fixtures.fourteen.expectedPairs, 7);
assert.deepEqual(fixtures.fourteen.expectedGroups, { A: 4, B: 3 });
assert.equal(fixtures.fourteen.expectedGroupMatches, 9);
assert.deepEqual(fixtures.fourteen.expectedMatches, { withoutThirdPlace: 12, withThirdPlace: 13 });
assert.equal(fixtures.oddFifteen.athletes.length, 15);
assert.equal(fixtures.oddFifteen.unpairedMemberCount, 1);
assert.deepEqual(fixtures.oddFifteen.expectedChoices, ['add_member', 'reserve_member', 'switch_format']);
console.log('PASS T1.D fixture contract: 14-athlete and odd 15-athlete cases');
