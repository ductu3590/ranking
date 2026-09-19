'use strict';

// Dien giai yeu cau va bao cao cua RPC sua tuong thich entry doi cu.
// Thuan JS: khong goi DB, chi rang buoc hop dong dau vao/dau ra.

const REPAIR_LEGACY_PAIRS_RPC = 'repair_legacy_division_pair_identity';
const LEGACY_CLIENT_REF_PREFIX = 'legacy:entry_member:';
const REPAIR_PLAN_VALUES = ['create_pair', 'already_paired'];
const PLANNED_COUNT_KEYS = ['athletes', 'roster', 'pairs', 'pair_members', 'entries_updated'];

function repairError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// client_ref duoc khoa theo tournament_entry_members.id, khong bao gio theo ten.
function legacyClientRef(entryMemberId) {
  const numeric = Number(entryMemberId);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw repairError('SETUP_PAYLOAD_INVALID', 'entry_member_id không hợp lệ');
  }
  return `${LEGACY_CLIENT_REF_PREFIX}${numeric}`;
}

// Mac dinh la chay thu. Muon ghi that phai co ca dry_run:false VA confirm_apply:true.
function resolveRepairMode(body = {}) {
  const raw = body?.dry_run ?? body?.dryRun;
  if (raw !== undefined && raw !== null && typeof raw !== 'boolean') {
    throw repairError('SETUP_PAYLOAD_INVALID', 'dry_run phải là boolean');
  }
  const dryRun = raw === undefined || raw === null ? true : raw;
  const confirmApply = body?.confirm_apply ?? body?.confirmApply;
  if (!dryRun && confirmApply !== true) {
    throw repairError('REPAIR_CONFIRMATION_REQUIRED', 'Cần confirm_apply: true để áp dụng sửa tương thích');
  }
  return { dryRun, confirmApply: confirmApply === true };
}

function buildRepairArgs({ groupId, tournamentId, divisionId, dryRun, expectedSetupRevision, idempotencyKey }) {
  if (typeof dryRun !== 'boolean') throw repairError('SETUP_PAYLOAD_INVALID', 'dry_run phải là boolean');
  return {
    p_group_id: Number(groupId),
    p_tournament_id: Number(tournamentId),
    p_division_id: Number(divisionId),
    p_dry_run: dryRun,
    p_expected_setup_revision: Number(expectedSetupRevision),
    p_idempotency_key: String(idempotencyKey),
  };
}

function normalizeCounts(raw) {
  const counts = {};
  for (const key of PLANNED_COUNT_KEYS) {
    const value = Number(raw?.[key] ?? 0);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw repairError('INVALID_REPAIR_REPORT', 'Báo cáo sửa tương thích không hợp lệ');
    }
    counts[key] = value;
  }
  return counts;
}

function normalizeRepairReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw repairError('INVALID_REPAIR_REPORT', 'Báo cáo sửa tương thích không hợp lệ');
  }
  if (typeof report.dry_run !== 'boolean') {
    throw repairError('INVALID_REPAIR_REPORT', 'Báo cáo sửa tương thích thiếu dry_run');
  }
  const entries = Array.isArray(report.entries) ? report.entries : [];
  for (const entry of entries) {
    if (!REPAIR_PLAN_VALUES.includes(entry?.planned)) {
      throw repairError('INVALID_REPAIR_REPORT', 'Trạng thái planned của entry không hợp lệ');
    }
  }
  const normalized = {
    dry_run: report.dry_run,
    entries,
    planned: normalizeCounts(report.planned),
    ambiguities: Array.isArray(report.ambiguities) ? report.ambiguities : [],
    blockers: Array.isArray(report.blockers) ? report.blockers : [],
    summary: report.summary && typeof report.summary === 'object' ? report.summary : {},
  };
  if (!report.dry_run) {
    normalized.applied = normalizeCounts(report.applied);
    normalized.setup_revision = Number(report.setup_revision);
    if (!Number.isSafeInteger(normalized.setup_revision) || normalized.setup_revision < 1) {
      throw repairError('INVALID_REPAIR_REPORT', 'setup_revision sau khi áp dụng không hợp lệ');
    }
  }
  return normalized;
}

module.exports = {
  REPAIR_LEGACY_PAIRS_RPC,
  LEGACY_CLIENT_REF_PREFIX,
  REPAIR_PLAN_VALUES,
  PLANNED_COUNT_KEYS,
  legacyClientRef,
  resolveRepairMode,
  buildRepairArgs,
  normalizeRepairReport,
};
