'use strict';

function buildLogRow(input = {}) {
  const groupId = Number(input.groupId);
  const tournamentId = Number(input.tournamentId);
  const actor = String(input.actor || '').trim();
  const action = String(input.action || '').trim();
  const targetType = String(input.targetType || '').trim();

  if (!Number.isFinite(groupId) || groupId <= 0) throw new Error('operationLog: groupId là bắt buộc');
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) throw new Error('operationLog: tournamentId là bắt buộc');
  if (!actor) throw new Error('operationLog: actor là bắt buộc');
  if (!action) throw new Error('operationLog: action là bắt buộc');
  if (!targetType) throw new Error('operationLog: targetType là bắt buộc');

  return {
    group_id: groupId,
    tournament_id: tournamentId,
    division_id: input.divisionId == null ? null : Number(input.divisionId),
    actor,
    action,
    target_type: targetType,
    target_id: input.targetId == null ? null : Number(input.targetId),
    before: input.before == null ? null : input.before,
    after: input.after == null ? null : input.after,
    reason: input.reason == null || input.reason === '' ? null : String(input.reason).trim(),
  };
}

async function writeOperationLog(db, input) {
  try {
    const row = buildLogRow(input);
    const { error } = await db.from('tournament_operation_logs').insert(row);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { buildLogRow, writeOperationLog };
