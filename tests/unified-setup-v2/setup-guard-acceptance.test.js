'use strict';

const { assert, expectModule } = require('./_harness');

const validateFinalize = expectModule('lib/tournament/setupValidation.js', 'validateFinalize');
const result = validateFinalize({
    tournament: { name: 'Da co ty so' },
    format: { entrantType: 'doubles', formatKey: 'group_knockout' },
    pairs: [{ pairId: 'pair-1', memberIds: ['m1', 'm2'] }],
    matchState: { started: true, hasScore: true },
});
assert.equal(result.ok, false, 'finalize rejects structural changes after a result exists');
assert.equal(result.error.code, 'STRUCTURE_LOCKED_BY_RESULTS', 'result lock has stable error code');

console.log('setup guard acceptance: result-lock contract ok');
