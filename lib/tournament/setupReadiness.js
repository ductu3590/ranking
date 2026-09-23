'use strict';

function normalizeSetupReadiness(readiness) {
  if (!readiness || typeof readiness !== 'object' || Array.isArray(readiness)) {
    throw new Error('INVALID_SETUP_READINESS');
  }
  const status = readiness.status;
  const revision = Number(readiness.revision);
  if (!['ready', 'blocked'].includes(status) || !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error('INVALID_SETUP_READINESS');
  }
  return {
    ...readiness,
    revision,
    reasons: Array.isArray(readiness.reasons) ? readiness.reasons : [],
    counts: readiness.counts && typeof readiness.counts === 'object' ? readiness.counts : {},
  };
}

// Readiness DUY NHẤT của luồng tạo giải v3 (spec Lát 0 §8): rail, action bar,
// stepper và console cùng đọc từ đây. Không hard-code trạng thái hay con số nào.
function computeSetupReadiness(rawDraft, ctx = {}) {
  const { validateStep, computeCompletedThrough } = require('./setupStepRules');
  const { messageFor } = require('./setupMessages');
  const byStep = {};
  const blockers = [];
  const warnings = [];
  for (const step of [1, 2, 3, 4]) {
    const result = validateStep(rawDraft, step, ctx);
    const decorate = (item) => ({ ...item, message: messageFor(item.code, item.params).text });
    byStep[step] = { ok: result.ok, blockers: result.blockers.map(decorate), warnings: result.warnings.map(decorate) };
    blockers.push(...byStep[step].blockers);
    warnings.push(...byStep[step].warnings);
  }
  const completedThrough = computeCompletedThrough(rawDraft, ctx);
  return { completedThrough, byStep, blockers, warnings, readyToFinalize: completedThrough === 3 && byStep[4].ok };
}

module.exports = { normalizeSetupReadiness, computeSetupReadiness };
