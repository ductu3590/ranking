const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const progress = require(path.join(root, 'docs/pickhub-core/progress.json'));
const human = fs.readFileSync(path.join(root, 'docs/pickhub-core/PROGRESS.md'), 'utf8');
const phase = progress.phases.find((item) => item.id === 1);

assert.strictEqual(progress.active_phase, 1);
assert.strictEqual(phase.status, 'completed');
assert.strictEqual(phase.branch, 'codex/phase-1-foundation-hardening');
assert.match(
    human,
    /Phase 1 — Ổn định nền tảng \| `completed` \| `codex\/phase-1-foundation-hardening`/
);

console.log('phase 1 progress contract ok');
