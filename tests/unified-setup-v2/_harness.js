'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));

function expectModule(file, exportName) {
    assert.ok(exists(file), `module ${file} exists`);
    const mod = require(path.join(ROOT, file));
    assert.equal(typeof mod[exportName], 'function', `${file} exports ${exportName}()`);
    return mod[exportName];
}

module.exports = { ROOT, read, exists, expectModule, assert };
