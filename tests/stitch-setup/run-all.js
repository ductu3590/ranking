'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function discoverTests(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return discoverTests(fullPath);
        return entry.isFile() && entry.name.endsWith('.test.js') ? [fullPath] : [];
    });
}

const files = discoverTests(__dirname).sort();
const results = files.map((file) => ({
    file: path.relative(__dirname, file),
    code: spawnSync(process.execPath, [file], { stdio: 'inherit' }).status,
}));

console.log('\n=== stitch-setup summary ===');
for (const result of results) console.log(`${result.code === 0 ? 'PASS' : 'RED '} exit=${result.code}  ${result.file}`);
process.exit(results.some((result) => result.code !== 0) ? 1 : 0);
