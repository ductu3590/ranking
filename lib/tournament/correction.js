'use strict';
// Sửa kết quả đã chốt. Thuần, không I/O.
// Nguyên tắc: máy KHÔNG tự dây chuyền huỷ kết quả vòng sau. Nó chỉ nói rõ
// trận nào bị ảnh hưởng và chặn lại để BTC quyết từng bước.

// Trận vòng sau đã bắt đầu thì không được đổi đội thắng vòng trước: có người
// đang trên sân đấu dưới danh nghĩa một suất mà ta sắp lấy đi.
const RUNNING = new Set(['warmup', 'live', 'paused']);

function correctionImpact(match = {}, downstreamMatch = null, options = {}) {
  const winnerChanged = options.winnerChanged === true;

  if (!winnerChanged || !match.parent_match_id || !downstreamMatch) {
    return { blocked: false, code: null, message: null, downstream: [] };
  }

  const downstream = [{ id: downstreamMatch.id, status: downstreamMatch.status }];

  if (RUNNING.has(downstreamMatch.status)) {
    return {
      blocked: true,
      code: 'CORRECTION_BLOCKED_DOWNSTREAM',
      message: `Trận vòng sau (#${downstreamMatch.id}) đang diễn ra. Đưa trận đó về trạng thái chưa gọi rồi mới sửa được kết quả này.`,
      downstream,
    };
  }

  if (downstreamMatch.status === 'finalized') {
    return {
      blocked: true,
      code: 'CORRECTION_BLOCKED_DOWNSTREAM',
      message: `Trận vòng sau (#${downstreamMatch.id}) đã chốt kết quả. Phải huỷ chốt trận đó trước, rồi mới sửa được kết quả này.`,
      downstream,
    };
  }

  return { blocked: false, code: null, message: null, downstream };
}

// Bảng tournament_result_corrections có sẵn cột cho luồng duyệt hai bước.
// Mô hình vận hành hiện tại chỉ có một BTC nên ghi thẳng 'applied' với
// requester = approver. KHÔNG bỏ cột — để dành nếu sau này cần duyệt hai bước.
function buildCorrectionRow(input = {}) {
  const groupId = Number(input.groupId);
  const tournamentId = Number(input.tournamentId);
  const matchId = Number(input.matchId);
  const actor = String(input.actor || '').trim();
  const reason = String(input.reason || '').trim();

  if (!Number.isFinite(groupId) || groupId <= 0) throw new Error('correction: groupId là bắt buộc');
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) throw new Error('correction: tournamentId là bắt buộc');
  if (!Number.isFinite(matchId) || matchId <= 0) throw new Error('correction: matchId là bắt buộc');
  if (!actor) throw new Error('correction: actor là bắt buộc');
  if (!reason) throw new Error('correction: phải nhập lý do khi sửa kết quả đã chốt');

  const now = new Date().toISOString();
  return {
    group_id: groupId,
    tournament_id: tournamentId,
    division_id: input.divisionId == null ? null : Number(input.divisionId),
    match_id: matchId,
    before_payload: input.before == null ? null : input.before,
    after_payload: input.after == null ? null : input.after,
    reason,
    requester: actor,
    approver: actor,
    status: 'applied',
    requested_at: now,
    approved_at: now,
    applied_at: now,
  };
}

module.exports = { correctionImpact, buildCorrectionRow };
