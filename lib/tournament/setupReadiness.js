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

module.exports = { normalizeSetupReadiness };
