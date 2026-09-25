'use strict';
// Chiếu view model bàn điều hành (buildOperationsBoard) ra trang công khai (spec Epic 2 E3 §4). Thuần.
// Chỉ giữ những gì người xem ở sân cần: tên cặp đang hiển thị, nhãn trận, sân, mốc giờ, tỉ số đã lưu.
// Không trả version, busyCourt, stageAction, settings nội bộ; không bao giờ có số điện thoại / member / token
// (board vốn không chứa, whitelist chặn thêm một lớp).

const SIDE_FIELDS = ['entryId', 'name', 'source'];
const RULE_FIELDS = ['bestOf'];
const ITEM_FIELDS = [
  'id', 'status', 'stageId', 'stageName', 'title', 'code', 'court', 'winnerTo', 'resultType',
  'warmupStartedAt', 'startedAt', 'endedAt', 'games', 'winnerSide', 'readiness', 'projectedStart', 'round', 'slot',
  'winnerName', 'loserName', 'scoreText',
];

function pick(record, fields) {
  const out = {};
  if (!record || typeof record !== 'object') return out;
  for (const field of fields) if (record[field] !== undefined) out[field] = record[field];
  return out;
}

function item(value) {
  if (!value) return null;
  const projected = pick(value, ITEM_FIELDS);
  projected.a = pick(value.a, SIDE_FIELDS);
  projected.b = pick(value.b, SIDE_FIELDS);
  projected.rule = pick(value.rule, RULE_FIELDS);
  projected.games = Array.isArray(value.games) ? value.games.map((game) => ({ a: Number(game.a) || 0, b: Number(game.b) || 0 })) : [];
  return projected;
}

function projectPublicBoard(board) {
  if (!board || typeof board !== 'object') return null;
  const progress = board.progress || {};
  // Thẻ sân của board không kèm tỉ số; lấy ván đã lưu từ schedule để người xem thấy "Ván 1: 11–7".
  const gamesById = new Map((board.schedule || []).flatMap((group) => group.matches || []).map((row) => [String(row.id), row.games]));
  return {
    progress: { total: Number(progress.total) || 0, finalized: Number(progress.finalized) || 0 },
    stages: (board.stages || []).map((stage) => pick(stage, ['id', 'name', 'format', 'status', 'divisionId'])),
    courts: (board.courts || []).filter((court) => court.match).map((court) => ({ label: court.label, state: court.state, match: item({ ...court.match, games: gamesById.get(String(court.match.id)) }) })),
    schedule: (board.schedule || []).map((group) => ({
      ...pick(group, ['key', 'stageId', 'stageName', 'title']),
      counts: pick(group.counts, ['total', 'finalized', 'running']),
      matches: (group.matches || []).map(item),
    })),
    recent: (board.recent || []).map(item),
  };
}

module.exports = { projectPublicBoard, ITEM_FIELDS, SIDE_FIELDS };
