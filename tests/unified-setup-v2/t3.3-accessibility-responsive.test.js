'use strict';

const { read, assert } = require('./_harness');

const results = [];
function check(name, condition, detail) {
  results.push({ name, status: condition ? 'PASS' : 'FAIL', detail });
}

const shellCss = read('app/giai-dau/v2/setup/setup.css');
const workspace = read('app/giai-dau/v2/setup/TournamentSetupWorkspace.js');
const stepper = read('app/giai-dau/v2/setup/SetupStepper.js');
const actionBar = read('app/giai-dau/v2/setup/SetupActionBar.js');
const roster = read('app/giai-dau/v2/setup/participants/ParticipantRosterPicker.js');
const rosterCss = read('app/giai-dau/v2/setup/participants/participants.css');
const pairing = read('app/giai-dau/v2/setup/pairing/PairingBoard.js');
const pairingCss = read('app/giai-dau/v2/setup/pairing/pairing.css');
const draw = read('app/giai-dau/v2/setup/steps/DrawScheduleStep.js');
const review = read('app/giai-dau/v2/setup/steps/ReviewFinalizeStep.js');
const drawCss = read('app/giai-dau/v2/setup/draw/draw-review.css');
const consoleShellCss = read('app/giai-dau/v2/console/shell.css');
const info = read('app/giai-dau/v2/setup/steps/InfoParticipantsStep.js');

check('A11Y-01 semantic stepper', /<nav[^>]+aria-label="Các bước thiết lập giải"/.test(stepper) && /aria-current=\{step\.id === currentStep \? 'step'/.test(stepper), 'Stepper has navigation landmark and current-step state.');
check('A11Y-02 keyboard-native controls', /<button/.test(stepper) && /type="checkbox"/.test(roster) && /<button/.test(pairing) && /<button/.test(draw), 'Primary setup actions use native button/checkbox controls, so Enter/Space is supplied by the browser.');
check('A11Y-03 focus move after step change', /activeRef\.current\.focus\(\)/.test(stepper), 'Stepper explicitly moves focus to the newly active step.');
check('A11Y-04 focus visible across setup controls', /setup-stepper__button:focus-visible,[\s\S]*setup-btn:focus-visible/.test(shellCss) && /participants-[\s\S]*:focus-visible|pairing-[\s\S]*:focus-visible|setup-primary-action:focus-visible/.test(`${rosterCss}\n${pairingCss}\n${drawCss}`), 'All interactive controls need a visible focus rule, including roster, pairing, and draw/review controls.');
check('A11Y-05 labels and live status', /<label className="participants-search">/.test(roster) && /<label className="setup-config-field">/.test(draw) && /aria-live="polite"/.test(actionBar), 'Search/config inputs have visible labels and save status is announced.');
check('RWD-01 mobile stepper contains wide navigation locally', /\.setup-stepper\s*\{[\s\S]*overflow-x:\s*auto/.test(shellCss) && /@media \(max-width: 540px\)[\s\S]*\.setup-stepper__label--full\s*\{\s*display:\s*none/.test(shellCss) && /\.setup-stepper__label--short\s*\{\s*display:\s*block/.test(shellCss), 'At 390px, wide step navigation must stay inside its local scroller and use the compact accessible label.');
check('RWD-02 44px target baseline', /\.setup-btn\s*\{[\s\S]*min-height:\s*44px/.test(shellCss) && /participants-primary\s*\{[\s\S]*min-height:\s*44px/.test(rosterCss) && /pairing-mode button,[\s\S]*min-height:\s*44px/.test(pairingCss), 'All setup action families need a 44px minimum height; checkbox controls need an equivalent hit area.');
check('RWD-03 tablet and desktop summary rail', /@media \(min-width: 860px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) 340px/.test(shellCss) && /\.setup-summary\s*\{\s*position: sticky/.test(shellCss), 'Desktop uses a two-column sticky summary rail; mobile starts as one column.');
check('RWD-04 bracket horizontal containment', /\.setup-bracket-scroll\s*\{\s*overflow-x: auto/.test(drawCss) && /\.setup-main\s*\{\s*min-width: 0/.test(shellCss), 'Wide bracket content is contained by a local horizontal scroller.');
check('LOAD-01 shell save/finalize loading', /saveStatus === 'saving'/.test(actionBar) && /isFinalizing/.test(actionBar), 'Global action bar disables and labels save/finalize operations while pending.');
check('LOAD-02 step-local action loading', /useState\(/.test(draw) && /set[A-Za-z]*Error/.test(draw) && /disabled=\{[^}]+\}/.test(draw) && /Đang (bốc|sinh|xếp)/.test(draw) && /const saving = saveState\.status === 'saving';/.test(review) && /const finalizing = finalizeState\.status === 'finalizing';/.test(review) && /saveState\.error/.test(review) && /finalizeState\.error/.test(review), 'Draw actions need pending, disabled, and adjacent error UI; review may consume its operation state through explicit step props.');
check('ERR-01 errors stay next to the failing control', /clubLoadError/.test(info) && /catch \(inviteError\) \{[\s\S]*if \(inviteError\?\.status !== 409\) throw inviteError;/.test(info) === false && /setup-status-item blocker/.test(review), 'Invite, draw, and finalize errors need adjacent persistent error UI rather than an uncaught action error.');
check('THEME-01 console has no ops token', !/--ops-/.test(consoleShellCss) && /background:\s*var\(--bg-secondary\)/.test(consoleShellCss) && /background:\s*var\(--bg-card\)/.test(consoleShellCss), 'Console inherits shared light tokens and contains no ops-* theme declarations.');

for (const result of results) console.log(`${result.status} ${result.name}: ${result.detail}`);
const failures = results.filter((result) => result.status === 'FAIL');
console.log(`T3.3 static QA: ${results.length - failures.length} PASS, ${failures.length} FAIL`);
assert.equal(failures.length, 0, `T3.3 static QA failures: ${failures.map((result) => result.name).join(', ')}`);