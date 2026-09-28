import { parseFriendlyPairKey } from '@/lib/tournament/friendlyClubs';
import { HOST_CLUB_KEY, clubKeyForId } from '@/lib/tournament/friendlySetup';

// Dựng `ctx.friendly` phía client từ khối `friendly` của GET /setup (F2 §3.5) để readiness trên màn hình (rail, bước 3/4)
// đếm đúng cặp hiệu lực và không báo "bốc thăm lại" sai. Server vẫn là nơi quyết định progress/finalize; khối view không
// có memberId nên tham chiếu người trong cặp khách ở đây chỉ là chỗ giữ (luật bước chỉ đếm cặp, không đọc người).
// Hạn mức cặp không có trong view → null (server kiểm lại khi bốc thăm/chốt).
export function clientFriendlyContext(view) {
  if (!view || typeof view !== 'object') return null;
  const approved = Array.isArray(view.approvedPairs) ? view.approvedPairs : [];
  const byClub = new Map();
  const approvedPairs = [];
  for (const pair of approved) {
    const parsed = parseFriendlyPairKey(pair?.pairId);
    if (!parsed) continue;
    const entry = byClub.get(parsed.tournamentClubId) || { version: parsed.approvedVersion, pairs: [] };
    const slot = entry.pairs.length * 2;
    entry.pairs.push({ pairId: parsed.pairId, participantRefs: [`member:${slot + 1}`, `member:${slot + 2}`] });
    byClub.set(parsed.tournamentClubId, entry);
    approvedPairs.push({
      pairId: pair.pairId,
      participantRefs: [],
      tournamentClubId: parsed.tournamentClubId,
      clubKey: clubKeyForId(parsed.tournamentClubId),
      clubName: pair.clubName || null,
      memberNames: (pair.members || []).map((member) => member?.name || ''),
    });
  }
  const clubs = Array.isArray(view.clubs) ? view.clubs : [];
  const clubNames = { [HOST_CLUB_KEY]: view.hostClub?.name || 'CLB chủ nhà' };
  const clubRows = clubs.map((club) => {
    const id = String(club.tournamentClubId);
    const approvedEntry = byClub.get(id);
    clubNames[clubKeyForId(id)] = club.name || 'CLB khách';
    return {
      id,
      club_id: id,
      clubName: club.name || 'CLB khách',
      invitation_status: club.status,
      roster_approved_version: club.status === 'approved' ? (approvedEntry?.version || '1') : null,
      roster_submitted: { pairs: approvedEntry?.pairs || [] },
      quota: null,
      external_club_id: null,
    };
  });
  return {
    clubRows,
    approvedPairs,
    entitlements: null,
    maxGuestClubs: view.limit?.max ?? 1,
    clubNames,
    hostClubName: clubNames[HOST_CLUB_KEY],
    athletes: [],
  };
}

// Màu CLB theo tournamentClubId (server tính bằng clubPalette) — chủ nhà dùng hostClub.color.
export function clubLookup(view) {
  const map = new Map();
  for (const club of Array.isArray(view?.clubs) ? view.clubs : []) {
    map.set(String(club.tournamentClubId), { name: club.name, color: club.color });
  }
  return {
    host: { name: view?.hostClub?.name || 'CLB của bạn', color: view?.hostClub?.color || null },
    byId: (id) => map.get(String(id)) || null,
  };
}

// Mã blocker thuộc về CLB khách (không phải lỗi của phần chủ nhà tự làm được). Bước 4 bị chặn khi CHỈ còn các mã này
// (D52: chủ nhà làm tiếp Bước 1–3, Bước 4 chờ CLB khách gửi + được duyệt).
const CLUB_WAIT_CODES = new Set(['FRIENDLY_CLUB_NOT_READY', 'FRIENDLY_CLUBS_TOO_FEW', 'PAIR_COUNT_BELOW_MINIMUM']);

export function onlyWaitingForClubs(stepResult) {
  const blockers = stepResult?.blockers || [];
  return blockers.length > 0 && blockers.every((item) => CLUB_WAIT_CODES.has(item.code))
    && blockers.some((item) => item.code === 'FRIENDLY_CLUB_NOT_READY' || item.code === 'FRIENDLY_CLUBS_TOO_FEW');
}
