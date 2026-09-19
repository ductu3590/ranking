'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const files = fs.readdirSync(__dirname)
    .filter((file) => file.endsWith('.test.js'))
    .sort();
const results = files.map((file) => ({
    file,
    code: spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' }).status,
}));

console.log('\n=== unified-setup-v2 red-test summary ===');
for (const result of results) console.log(`${result.code === 0 ? 'PASS' : 'RED '} exit=${result.code}  ${result.file}`);
process.exit(results.some((result) => result.code !== 0) ? 1 : 0);
