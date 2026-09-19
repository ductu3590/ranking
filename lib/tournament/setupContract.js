'use strict';

// Một nguồn chuẩn cho cấu hình mới và các alias đã được lưu trước đây.
function resolveGroupCount(config = {}) {
  const values = ['groupCount', 'groups', 'group_count']
    .filter((key) => config[key] != null)
    .map((key) => Number(config[key]));
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('INVALID_GROUP_COUNT');
  }
  if (new Set(values).size > 1) throw new Error('CONFLICTING_GROUP_COUNT');
  return values[0] ?? 1;
}

module.exports = { resolveGroupCount };