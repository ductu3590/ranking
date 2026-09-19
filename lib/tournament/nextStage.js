'use strict';

// Không dùng single(): nhiều kết quả phải là lỗi, không được hiểu là hết giải.
async function findNextStage(db, stage, groupId) {
  let query = db.from('tournament_stages')
    .select('id, stage_order')
    .eq('group_id', groupId)
    .eq('tournament_id', stage.tournament_id)
    .eq('stage_order', stage.stage_order + 1);
  query = stage.division_id == null
    ? query.is('division_id', null)
    : query.eq('division_id', stage.division_id);
  return query.maybeSingle();
}

module.exports = { findNextStage };