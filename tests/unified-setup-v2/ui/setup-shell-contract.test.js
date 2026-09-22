'use strict';

const { read, exists, assert } = require('../_harness');

const files = [
  'app/giai-dau/v2/setup/TournamentSetupWorkspace.js',
  'app/giai-dau/v2/setup/SetupStepper.js',
  'app/giai-dau/v2/setup/SetupSummaryRail.js',
  'app/giai-dau/v2/setup/SetupActionBar.js',
  'app/giai-dau/v2/setup/SetupContext.js',
  'app/giai-dau/v2/setup/setup.css',
];

for (const file of files) {
  assert.ok(exists(file), `${file} exists`);
}

const workspace = read('app/giai-dau/v2/setup/TournamentSetupWorkspace.js');
const context = read('app/giai-dau/v2/setup/SetupContext.js');
const stepper = read('app/giai-dau/v2/setup/SetupStepper.js');
const actionBar = read('app/giai-dau/v2/setup/SetupActionBar.js');
const css = read('app/giai-dau/v2/setup/setup.css');

assert.match(workspace, /TournamentSetupProvider/, 'workspace wraps provider');
assert.match(workspace, /renderStep/, 'workspace exposes renderStep slot for T2.B/T2.C');
assert.match(workspace, /SetupActionBar/, 'workspace renders sticky action bar component');
assert.doesNotMatch(workspace, /supabase\.from|fetch\(/, 'workspace has no business I/O');
assert.doesNotMatch(context, /supabase\.from|localStorage/, 'context does not call Supabase or localStorage');
assert.match(context, /ioAdapter\.saveDraft/, 'save goes through adapter');
assert.match(context, /ioAdapter\.finalizeDraft/, 'finalize goes through adapter');
assert.match(context, /saveStatus: 'saved'/, 'saved state only reducer-confirmed');
assert.match(context, /highestAllowedStep/, 'step guard tracks highest allowed step');
assert.match(stepper, /aria-current=.*'step'/, 'stepper exposes current step for assistive tech');
assert.match(stepper, /focus\(\)/, 'stepper moves keyboard focus after step change');
assert.match(actionBar, /Lưu nháp/, 'save draft label is explicit');
assert.match(actionBar, /Chốt bốc thăm & tạo lịch/, 'finalize label is explicit');
assert.match(css, /position:\s*fixed;[\s\S]*bottom:\s*10px/, 'action bar is sticky at bottom');
assert.match(css, /@media \(min-width: 860px\)/, 'desktop layout extends mobile-first CSS');
assert.match(css, /grid-template-columns: 1fr/, 'mobile layout is single column first');
assert.doesNotMatch(css, /ops-/, 'setup shell does not use ops-* color tokens');

console.log('T2.A setup shell contract ok');
