'use strict';
// BXH tổng CLB của giải giao hữu (spec Epic 3 F2 §7, ADR-007 D40) + D43. Thuần CommonJS, deterministic, không I/O.
//
// Không viết luật hạng mới: chuẩn hoá đầu vào rồi gọi interclub.aggregateClubStandings (điểm trận, tiebreak legacy_v2).
// Hàm đó bỏ qua trận nội bộ một CLB (không tính cho ai) và trận chưa xong — đúng ý D40.

const { aggregateClubStandings } = require('./interclub');

// Màu 0 = chủ nhà (brand); khách lấy từ 1 theo tournament_clubs.id tăng dần, hết bảng thì quay vòng (bỏ màu 0).
const CLUB_COLORS = Object.freeze(['#7c3aed', '#0e7490', '#b45309', '#be185d', '#15803d', '#1d4ed8', '#c2410c', '#4d7c0f', '#0f766e', '#a21caf']);
const DONE_STATUSES = new Set(['finalized', 'done']);

function idKey(value) {
  return value == null ? null : String(value);
}

function compareIds(a, b) {
  const x = idKey(a);
  const y = idKey(b);
  return (x.length - y.length) || (x < y ? -1 : x > y ? 1 : 0);
}

// clubs: [{ tournamentClubId, isHost }] → Map(String(tournamentClubId) → màu)
function clubPalette(clubs) {
  const palette = new Map();
  const list = Array.isArray(clubs) ? clubs : [];
  for (const club of list.filter((item) => item?.isHost)) palette.set(idKey(club.tournamentClubId), CLUB_COLORS[0]);
  const guests = list.filter((item) => !item?.isHost).map((item) => item.tournamentClubId).sort(compareIds);
  guests.forEach((id, index) => palette.set(idKey(id), CLUB_COLORS[1 + (index % (CLUB_COLORS.length - 1))]));
  return palette;
}

// clubs:   [{ tournamentClubId, name, isHost }]
// entries: [{ id, tournamentClubId }]
// matches: [{ id, entryAId, entryBId, winnerEntryId, status }] — mọi stage của division
// games:   [{ matchId, scoreA, scoreB }] — W.O. dùng tỉ số W.O. đã ghi (096)
// → { rows: [{ rank, tournamentClubId, name, color, isHost, played, won, lost, pointsFor, pointsAgainst, diff, pairCount }],
//     headToHead: rows.length === 2 ? { left, right, wins: [w0, w1] } : null,   // left = chủ nhà (nếu có)
//     counts: { interclubDone, internalDone } }
// CLB không có entry nào không có dòng (chưa từng thi đấu trong giải).
function computeFriendlyClubStandings({ clubs = [], entries = [], matches = [], games = [] } = {}) {
  const clubList = Array.isArray(clubs) ? clubs : [];
  const byClub = new Map(clubList.map((club) => [idKey(club.tournamentClubId), club]));
  const palette = clubPalette(clubList);
  // Sắp theo (CLB, entry) để thế hoà tuyệt đối (bốc thăm của tiebreak) không phụ thuộc thứ tự dòng DB trả về.
  const clubEntries = (Array.isArray(entries) ? entries : []).filter((entry) => byClub.has(idKey(entry.tournamentClubId)))
    .slice().sort((x, y) => compareIds(x.tournamentClubId, y.tournamentClubId) || compareIds(x.id, y.id));
  const entryClub = new Map(clubEntries.map((entry) => [idKey(entry.id), idKey(entry.tournamentClubId)]));

  const points = new Map();
  for (const game of Array.isArray(games) ? games : []) {
    const key = idKey(game.matchId);
    const total = points.get(key) || { a: 0, b: 0 };
    total.a += Number(game.scoreA || 0);
    total.b += Number(game.scoreB || 0);
    points.set(key, total);
  }

  const counts = { interclubDone: 0, internalDone: 0 };
  const normalized = [];
  for (const match of Array.isArray(matches) ? matches : []) {
    const done = DONE_STATUSES.has(match.status) && match.winnerEntryId != null;
    const a = entryClub.get(idKey(match.entryAId));
    const b = entryClub.get(idKey(match.entryBId));
    if (done && a && b) counts[a === b ? 'internalDone' : 'interclubDone'] += 1;
    const total = points.get(idKey(match.id)) || { a: 0, b: 0 };
    normalized.push({
      entrant_a_id: match.entryAId,
      entrant_b_id: match.entryBId,
      winner_entrant_id: match.winnerEntryId,
      status: done ? 'done' : String(match.status || 'pending'),
      points_a: total.a,
      points_b: total.b,
    });
  }

  const ranked = aggregateClubStandings(normalized, clubEntries.map((entry) => ({ id: entry.id, club_id: idKey(entry.tournamentClubId) })));
  const pairCount = (id) => clubEntries.filter((entry) => idKey(entry.tournamentClubId) === id).length;
  const rows = ranked.map((row, index) => {
    const club = byClub.get(row.club_id);
    return {
      rank: index + 1,
      tournamentClubId: club.tournamentClubId,
      name: club.name ?? null,
      color: palette.get(row.club_id),
      isHost: club.isHost === true,
      played: row.played,
      won: row.won,
      lost: row.lost,
      pointsFor: row.points_for,
      pointsAgainst: row.points_against,
      diff: row.points_for - row.points_against,
      pairCount: pairCount(row.club_id),
    };
  });

  let headToHead = null;
  if (rows.length === 2) {
    const [left, right] = rows.some((row) => row.isHost) ? [rows.find((r) => r.isHost), rows.find((r) => !r.isHost)] : rows;
    const side = (row) => ({ tournamentClubId: row.tournamentClubId, name: row.name, color: row.color });
    headToHead = { left: side(left), right: side(right), wins: [left.won, right.won] };
  }
  return { rows, headToHead, counts };
}

// D43: kết quả giải giao hữu KHÔNG tính vào xếp hạng nội bộ của CLB nào. Pipeline ranking nào đọc bảng tournament_*
// sau này phải gọi hàm này (test quét f2-standings khoá điều đó).
function countsForRanking({ settings } = {}) {
  return settings?.organizer_mode !== 'friendly';
}

module.exports = { CLUB_COLORS, clubPalette, computeFriendlyClubStandings, countsForRanking };
