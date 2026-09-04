const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const progress = require(path.join(root, 'docs/pickhub-core/progress.json'));
const human = fs.readFileSync(path.join(root, 'docs/pickhub-core/PROGRESS.md'), 'utf8');
const phase = progress.phases.find((item) => item.id === 1);

// Phase 1 remains completed while the roadmap advances. Keep this contract
// forward-compatible with the active Phase 2 (and later) release gates.
assert.ok(
    Number.isInteger(progress.active_phase)
    && progress.active_phase >= 1
    && progress.active_phase <= progress.phases.length,
    'active_phase must point to a declared roadmap phase'
);
assert.strictEqual(phase.status, 'completed');
assert.strictEqual(phase.branch, 'codex/phase-1-foundation-hardening');
assert.match(
    human,
    /Phase 1 — Ổn định nền tảng \| `completed` \| `codex\/phase-1-foundation-hardening`/
);

console.log('phase 1 progress contract ok');
