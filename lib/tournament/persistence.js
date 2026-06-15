// lib/tournament/persistence.js
// Helper thuần nối output engine với bảng DB. Không I/O.
function scheduleToInsertRows(scheduleMatches, { stageId, groupId }) {
  return scheduleMatches.map((m) => ({
    group_id: groupId,
    stage_id: stageId,
    round: m.round,
    bracket_slot: m.bracket_slot != null ? m.bracket_slot : null,
    group_label: m.group_label != null ? m.group_label : null,
    match_order: m.order != null ? m.order : null,
    entrant_a_id: m.entrant_a_id != null ? m.entrant_a_id : null,
    entrant_b_id: m.entrant_b_id != null ? m.entrant_b_id : null,
    status: 'pending',
  }));
}
function resolveParentLinks(scheduleMatches, dbRows) {
  const keyOf = (r) => `${r.round}:${r.bracket_slot}`;
  const dbByKey = new Map(dbRows.map((r) => [keyOf(r), r.id]));
  const schedBySlot = new Map(scheduleMatches.map((m) => [m.slot, m]));
  const updates = [];
  for (const m of scheduleMatches) {
    if (m.parent_slot == null) continue;
    const parent = schedBySlot.get(m.parent_slot);
    if (!parent) continue;
    const childId = dbByKey.get(keyOf(m));
    const parentId = dbByKey.get(keyOf(parent));
    if (childId != null && parentId != null) updates.push({ id: childId, parent_match_id: parentId });
  }
  return updates;
}
module.exports = { scheduleToInsertRows, resolveParentLinks };
