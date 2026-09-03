const assert = require('assert');
const { nextPollingDelay } = require('../../lib/pollingBackoff');

assert.strictEqual(nextPollingDelay(null, { success: true }), 5000);
assert.strictEqual(nextPollingDelay(5000, { success: false }), 10000);
assert.strictEqual(nextPollingDelay(30000, { success: false }), 60000);
assert.strictEqual(nextPollingDelay(60000, { success: false }), 60000);
assert.strictEqual(nextPollingDelay(60000, { success: true }), 5000);
console.log('phase 1 polling backoff behavior ok');
