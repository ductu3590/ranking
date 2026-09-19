'use strict';

// Compare-and-swap: một request đọc snapshot cũ không được ghi đè lần chốt mới.
async function saveDrawSnapshot(db, stage, groupId, nextDraw) {
  let query = db.from('tournament_stages')
    .update({ config: { ...(stage.config || {}), draw: nextDraw } })
    .eq('id', stage.id)
    .eq('group_id', groupId);
  query = stage.config == null
    ? query.is('config', null)
    : query.eq('config', JSON.stringify(stage.config));
  const { data, error } = await query.select('id, config').maybeSingle();
  if (error) throw error;
  if (!data) {
    const conflict = new Error('Bốc thăm đã thay đổi. Hãy tải lại trước khi tiếp tục.');
    conflict.code = '40001';
    throw conflict;
  }
  return data;
}

module.exports = { saveDrawSnapshot };