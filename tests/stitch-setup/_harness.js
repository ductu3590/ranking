'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const lib = (file) => require(path.join(ROOT, file));

// Chạy từng ca có tên; một ca hỏng không che các ca còn lại. Exit code ≠ 0 nếu có ca hỏng.
function suite(name, cases) {
  let failed = 0;
  for (const [title, fn] of Object.entries(cases)) {
    try {
      fn();
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${title}\n    ${error.message.split('\n').join('\n    ')}`);
    }
  }
  const total = Object.keys(cases).length;
  console.log(`${failed ? 'RED ' : 'ok  '} ${name}: ${total - failed}/${total}`);
  if (failed) process.exitCode = 1;
}

// ID tuần tự để test lặp lại được.
function sequence(prefix = 'pair_') {
  let n = 0;
  return () => `${prefix}${String(++n).padStart(4, '0')}`;
}

// PRNG cố định (mulberry32).
function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { ROOT, read, exists, lib, assert, suite, sequence, seededRandom };
