'use strict';

// REPRODUCTION TEST 2 — "the wizard's persistence path swallows exceptions and can still
// report success".
//
// Ground truth (08_FROZEN_CONTRACT.md sections 1 and 4): checkpoints 2/3/4/5a each end in
// `catch (_) {}` and the wizard then unconditionally calls setToast('OK da tao giai').
// That is why tournament 47 looks created while division 35 has zero identities.
//
// Contract rules being enforced:
//   - "No `catch (_) {}` anywhere in the persistence path."
//   - Success is shown ONLY after checkpoint 8 succeeds AND a verification getDivisionSetup()
//     reports readiness.status === 'ready'.
//   - A failed checkpoint keeps the draft and every entered player and offers "Thu lai".
//
// EVIDENCE KIND: static source inspection. It proves the code shape, not runtime behaviour.

const { readSource, createChecker, stripJsComments, exists } = require('./_harness');

const check = createChecker('wizard swallowed failure / false success (repro)', 'static');

const WIZARD_FILES = [
    'app/giai-dau/v2/TournamentWizard.js',
    'app/giai-dau/v2/wizard/StepRegister.js',
    'app/giai-dau/v2/wizard/StepConfig.js',
    'app/giai-dau/v2/wizard/StepInfo.js',
];

// 'Da tao giai' with diacritics, written as escapes so this file stays ASCII-safe.
const SUCCESS_LITERAL = 'Đã tạo giải';

for (const file of WIZARD_FILES) {
    if (!exists(file)) continue;
    const code = stripJsComments(readSource(file));

    // 1. No exception may be discarded. `catch (_) {}`, `catch {}`, `catch (e) {}` are all banned
    //    in these files: every one of them is a place where a failed write reports nothing.
    check.noMatch(code, /catch\s*\(\s*_[A-Za-z0-9_]*\s*\)/, `${file}: no "catch (_)" placeholder catch (a discarded error)`);
    check.noMatch(code, /catch\s*(\([^)]*\))?\s*\{\s*\}/, `${file}: no empty catch block`);
}

let wizard;
try {
    wizard = readSource('app/giai-dau/v2/TournamentWizard.js');
} catch (error) {
    check.fail('TournamentWizard.js must exist', error.message);
    check.done();
    return;
}
const code = stripJsComments(wizard);

// 2. Success must be gated on a verification read that reports readiness ready.
const successIndex = code.indexOf(SUCCESS_LITERAL);
check.ok(successIndex >= 0, `TournamentWizard.js exposes the creation-success message "${SUCCESS_LITERAL}" (if the wording changed, this QA test must be updated rather than the assertion dropped)`);
check.match(code, /getDivisionSetup\s*\(/, 'TournamentWizard.js performs a verification read (getDivisionSetup) before declaring success');
if (successIndex >= 0) {
    // The gate may be a dedicated verification checkpoint rather than inline code, so the
    // requirement is expressed structurally: a readiness read that compares against 'ready'
    // must exist and must come BEFORE the success message, and the success message must not
    // sit inside a catch block (which is how a partial failure would still look successful).
    const readinessGate = /readiness[\s\S]{0,120}status[\s\S]{0,200}['"]ready['"]|status\s*!==\s*['"]ready['"]/.exec(code);
    check.ok(
        Boolean(readinessGate) && readinessGate.index < successIndex,
        "success is gated on a readiness.status === 'ready' verification that runs before it (contract section 4)",
        readinessGate ? 'the readiness check appears AFTER the success message' : "no readiness.status vs 'ready' comparison found at all",
    );
    const preamble = code.slice(Math.max(0, successIndex - 1200), successIndex);
    check.noMatch(preamble, /catch\s*\(/, 'the success message is not emitted from inside a catch block');
    check.ok(
        /getDivisionSetup\s*\(/.test(code.slice(0, successIndex)),
        'the verification read (getDivisionSetup) happens before the success message',
    );
    check.match(code, /CHECKPOINT\.VERIFY|['"]verify['"]/, 'a distinct verification checkpoint exists as the single gate to the success message');
}

// 3. A failed checkpoint must offer a retry affordance and keep the draft.
check.match(code, /Th\u1eed l\u1ea1i/, 'TournamentWizard.js renders a "Thu lai" retry action for a failed checkpoint');

// 4. The wizard must not describe the flow as atomic (contract section 4: it is a durable
//    draft with checkpoints and must never be described as atomic).
check.noMatch(code, /\batomic\b/i, 'TournamentWizard.js does not claim the creation flow is atomic');

check.done();
