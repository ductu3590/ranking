// Dựng `ctx.community` phía client từ khối `community` của GET /setup (Epic 4 C3, D61) để readiness trên màn hình
// (rail, Bước 2–4) đếm đúng cặp đã duyệt và không báo "bốc thăm lại" sai. Server vẫn là nơi quyết định progress / finalize.
// View không chứa số điện thoại / ngày sinh / mã tài khoản; luật bước chỉ đọc pairId, số đếm và tên.
export function clientCommunityContext(view) {
  if (!view || typeof view !== 'object') return null;
  const pairs = Array.isArray(view.approvedPairs) ? view.approvedPairs : [];
  const counts = view.counts || {};
  return {
    approvedPairs: pairs.map((pair) => ({
      pairId: String(pair.pairId),
      registrationId: String(pair.registrationId ?? ''),
      participantRefs: [],
      memberNames: (pair.members || []).map((member) => member?.name || ''),
      memberPhr: (pair.members || []).map((member) => member?.phr ?? null),
      feeConfirmed: Boolean(pair.feeConfirmed),
    })),
    pendingCount: Number(counts.pending) || 0,
    awaitingPartnerCount: Number(counts.awaitingPartner) || 0,
    feeUnconfirmedCount: Number(counts.feeUnconfirmed) || 0,
    entryFee: Number(view.entryFee) || 0,
  };
}
