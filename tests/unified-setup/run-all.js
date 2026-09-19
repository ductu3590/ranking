'use strict';

// Runs every node-runnable unified-setup QA test and prints a per-file exit code.
// The browser harness is intentionally included LAST. Release mode is strict: BLOCKED
// means the release gate failed. Local contract-only work may explicitly opt out with
// PICKHUB_ALLOW_BLOCKED_BROWSER=1; CI/release must never set that flag.
//
// Proposed package.json script (package.json is lead-owned, QA does not edit it):
//   "test:unified-setup": "node tests/unified-setup/run-all.js"

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((file) => file.endsWith('.test.js')).sort();
const contractFiles = files.filter((file) => !file.endsWith('.browser.test.js'));
const browserFiles = files.filter((file) => file.endsWith('.browser.test.js'));

const results = [];
for (const file of [...contractFiles, ...browserFiles]) {
    const run = spawnSync(process.execPath, [path.join(dir, file)], { stdio: 'inherit' });
    results.push({ file, code: run.status });
}

console.log('\n=== unified-setup QA summary ===');
for (const result of results) {
    const label = result.code === 0 ? 'PASS' : result.code === 2 ? 'BLOCKED' : 'FAIL';
    console.log(`${label.padEnd(8)} exit=${result.code}  ${result.file}`);
}
const allowBlocked = process.env.PICKHUB_ALLOW_BLOCKED_BROWSER === '1';
const failed = results.filter((result) => result.code !== 0 && !(allowBlocked && result.code === 2)).length;
if (allowBlocked && results.some((result) => result.code === 2)) {
    console.warn('LOCAL-ONLY: browser BLOCKED was allowed by PICKHUB_ALLOW_BLOCKED_BROWSER=1');
}
process.exit(failed ? 1 : 0);
