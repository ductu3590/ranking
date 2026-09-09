'use strict';
// Sinh lịch từ engine rồi ghi xuống DB qua RPC.
// Dùng chung cho hai nơi: route `generate` (đường cũ) và route `draw` khi chốt
// bốc thăm. Chép hai bản logic này là cách chắc chắn nhất để chúng lệch nhau.

const { randomUUID } = require('crypto');
const { getScheduleEngine } = require('./engines');
const { scheduleToInsertRows } = require('./persistence');

// Trả { ok, error, code, data }. Không ném lỗi để nơi gọi tự dựng response.
async function generateAndPersistSchedule(db, {
  stage,
  entrants,
  groupId,
  seed = 1,
  idempotencyKey,
}) {
  if (!Array.isArray(entrants) || entrants.length < 2) {
    return { ok: false, code: 'TOO_FEW_ENTRANTS', error: 'Cần ít nhất 2 đội' };
  }

  let engine;
  try {
    engine = getScheduleEngine(stage.schedule_format);
  } catch (err) {
    return { ok: false, code: 'UNKNOWN_SCHEDULE_FORMAT', error: err.message };
  }

  let sched;
  try {
    sched = engine.generateSchedule(
      { schedule_format: stage.schedule_format, config: stage.config || {} },
      entrants,
      Number(seed) || 1,
    );
  } catch (err) {
    console.error('Generate schedule engine error:', err);
    return { ok: false, code: 'ENGINE_ERROR', error: err.message };
  }

  const entryBased = Boolean(stage.division_id);
  const rows = scheduleToInsertRows(sched, {
    stageId: stage.id,
    groupId,
    divisionId: stage.division_id,
    entryBased,
  });
  const rpcMatches = rows.map((row, index) => ({
    ...row,
    _key: String(sched[index].slot != null ? sched[index].slot : index),
    _parent_key: sched[index].parent_slot != null ? String(sched[index].parent_slot) : null,
  }));

  const key = String(idempotencyKey || randomUUID()).trim();
  if (!key || key.length > 200) {
    return { ok: false, code: 'INVALID_IDEMPOTENCY_KEY', error: 'idempotency_key không hợp lệ' };
  }

  const { data, error } = await db.rpc(
    entryBased ? 'replace_tournament_entry_schedule' : 'replace_tournament_schedule',
    {
      p_group_id: groupId,
      p_stage_id: stage.id,
      p_matches: rpcMatches,
      p_idempotency_key: key,
    },
  );
  if (error) return { ok: false, code: error.code || 'MUTATION_FAILED', error: error.message, rpcError: error };

  return { ok: true, data: { ...(data || { success: true }), matchCount: data?.matchCount ?? rows.length } };
}

module.exports = { generateAndPersistSchedule };
