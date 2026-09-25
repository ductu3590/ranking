'use strict';
// Epic 3 F2 §7 — BXH tổng CLB (D40: chỉ trận liên CLB đã chốt, đối đầu hai CLB) và D43 (không tính ranking).

const fs = require('node:fs');
const path = require('node:path');
const { assert, lib, suite, ROOT } = require('../_harness');
const F = lib('lib/tournament/friendlyStandings.js');
const { aggregateClubStandings } = lib('lib/tournament/interclub.js');

const CLUBS2 = [{ tournamentClubId: 880, name: 'CLB Test 23.9.2026', isHost: true }, { tournamentClubId: 881, name: 'CLB Test Responsive UI', isHost: false }];
// 59: e1..e4 · khách: e5..e7
const ENTRIES2 = [1, 2, 3, 4].map((id) => ({ id, tournamentClubId: 880 })).concat([5, 6, 7].map((id) => ({ id, tournamentClubId: 881 })));

let nextMatch = 100;
function match(a, b, winner, status = 'finalized', scores = [[11, 7]]) {
  const id = nextMatch += 1;
  return { match: { id, entryAId: a, entryBId: b, winnerEntryId: winner, status }, games: scores.map(([scoreA, scoreB]) => ({ matchId: id, scoreA, scoreB })) };
}

function build(list) {
  return { matches: list.map((x) => x.match), games: list.flatMap((x) => x.games) };
}

suite('f2 standings', {
  '2 CLB: trận nội bộ không tính; won(59) + won(khách) = played(59) = played(khách); headToHead'() {
    const data = build([
      match(1, 5, 1),                          // 59 thắng
      match(6, 2, 6, 'finalized', [[11, 9]]),   // khách thắng
      match(3, 7, 7, 'done', [[8, 11]]),        // khách thắng
      match(1, 2, 2, 'finalized', [[11, 3]]),   // nội bộ 59
      match(5, 6, 5, 'finalized', [[11, 1]]),   // nội bộ khách
    ]);
    const out = F.computeFriendlyClubStandings({ clubs: CLUBS2, entries: ENTRIES2, ...data });
    const host = out.rows.find((r) => r.isHost);
    const guest = out.rows.find((r) => !r.isHost);
    assert.equal(host.played, 3);
    assert.equal(guest.played, 3);
    assert.equal(host.won + guest.won, 3);
    assert.deepEqual([host.won, host.lost, guest.won, guest.lost], [1, 2, 2, 1]);
    assert.deepEqual([host.pointsFor, host.pointsAgainst, host.diff], [11 + 9 + 8, 7 + 11 + 11, 28 - 29]);
    assert.deepEqual([guest.pointsFor, guest.pointsAgainst], [29, 28]);
    assert.deepEqual(out.rows.map((r) => [r.rank, r.tournamentClubId]), [[1, 881], [2, 880]]);
    assert.deepEqual([host.pairCount, guest.pairCount], [4, 3]);
    assert.deepEqual(out.counts, { interclubDone: 3, internalDone: 2 });
    assert.deepEqual(out.headToHead, {
      left: { tournamentClubId: 880, name: 'CLB Test 23.9.2026', color: F.CLUB_COLORS[0] },
      right: { tournamentClubId: 881, name: 'CLB Test Responsive UI', color: F.CLUB_COLORS[1] },
      wins: [1, 2],
    });
    assert.deepEqual(Object.keys(host).sort(), ['color', 'diff', 'isHost', 'lost', 'name', 'pairCount', 'played', 'pointsAgainst', 'pointsFor', 'rank', 'tournamentClubId', 'won'].sort());
  },

  'W.O. tính thắng (tỉ số W.O. đã ghi); trận chưa chốt / đang đấu / thiếu người thắng không tính'() {
    const data = build([
      match(1, 5, 5, 'finalized', [[0, 11]]),   // W.O. khách thắng
      match(2, 6, null, 'live', [[5, 3]]),
      match(3, 7, 3, 'pending', []),
      match(4, 5, null, 'finalized', []),
      match(null, 5, null, 'pending', []),       // trận chờ suất loại trực tiếp
    ]);
    const out = F.computeFriendlyClubStandings({ clubs: CLUBS2, entries: ENTRIES2, ...data });
    const guest = out.rows.find((r) => r.tournamentClubId === 881);
    assert.deepEqual([guest.played, guest.won, guest.pointsFor, guest.pointsAgainst], [1, 1, 11, 0]);
    assert.deepEqual(out.counts, { interclubDone: 1, internalDone: 0 });
    assert.deepEqual(out.headToHead.wins, [0, 1]);
  },

  'chưa trận nào: hai dòng 0, headToHead 0–0'() {
    const out = F.computeFriendlyClubStandings({ clubs: CLUBS2, entries: ENTRIES2, matches: [], games: [] });
    assert.equal(out.rows.length, 2);
    assert.ok(out.rows.every((r) => r.played === 0 && r.won === 0));
    assert.deepEqual(out.headToHead.wins, [0, 0]);
    const reversed = F.computeFriendlyClubStandings({ clubs: [...CLUBS2].reverse(), entries: [...ENTRIES2].reverse(), matches: [], games: [] });
    assert.deepEqual(reversed.rows, out.rows, 'thế hoà tuyệt đối không phụ thuộc thứ tự dòng đầu vào');
  },

  '3 CLB (ca core): thứ hạng đúng thứ tự aggregateClubStandings; headToHead = null'() {
    const clubs = [...CLUBS2, { tournamentClubId: 882, name: 'CLB Khách B', isHost: false }];
    const entries = [...ENTRIES2, { id: 8, tournamentClubId: 882 }, { id: 9, tournamentClubId: 882 }];
    const data = build([match(1, 8, 8), match(5, 9, 9, 'finalized', [[4, 11]]), match(2, 6, 2), match(3, 8, 3, 'finalized', [[11, 10]]), match(7, 9, 9)]);
    const out = F.computeFriendlyClubStandings({ clubs, entries, ...data });
    assert.equal(out.headToHead, null);
    const reference = aggregateClubStandings(
      data.matches.map((m) => {
        const games = data.games.filter((g) => g.matchId === m.id);
        return { entrant_a_id: m.entryAId, entrant_b_id: m.entryBId, winner_entrant_id: m.winnerEntryId, status: 'done',
          points_a: games.reduce((s, g) => s + g.scoreA, 0), points_b: games.reduce((s, g) => s + g.scoreB, 0) };
      }),
      entries.map((e) => ({ id: e.id, club_id: e.tournamentClubId })),
    );
    assert.deepEqual(out.rows.map((r) => r.tournamentClubId), reference.map((r) => r.club_id));
    assert.deepEqual(out.rows.map((r) => r.rank), [1, 2, 3]);
    assert.deepEqual(out.rows.map((r) => r.won), reference.map((r) => r.won));
  },

  'màu: chủ nhà luôn CLUB_COLORS[0]; khách theo tournamentClubId tăng dần'() {
    const palette = F.clubPalette([
      { tournamentClubId: 990, isHost: false }, { tournamentClubId: 995, isHost: true }, { tournamentClubId: 881, isHost: false },
    ]);
    assert.equal(palette.get('995'), F.CLUB_COLORS[0]);
    assert.equal(palette.get('881'), F.CLUB_COLORS[1]);
    assert.equal(palette.get('990'), F.CLUB_COLORS[2]);
    assert.equal(F.CLUB_COLORS[0], '#7c3aed');
    assert.equal(F.CLUB_COLORS[1], '#0e7490');
    const many = F.clubPalette([{ tournamentClubId: 1, isHost: true }, ...Array.from({ length: 40 }, (_, i) => ({ tournamentClubId: 100 + i, isHost: false }))]);
    assert.ok([...many.entries()].filter(([id]) => id !== '1').every(([, color]) => color !== F.CLUB_COLORS[0]), 'khách không bao giờ lấy màu chủ nhà');
  },

  'countsForRanking (D43): friendly → false; nội bộ / thiếu settings → true'() {
    assert.equal(F.countsForRanking({ settings: { organizer_mode: 'friendly' } }), false);
    assert.equal(F.countsForRanking({ settings: { organizer_mode: 'internal' } }), true);
    assert.equal(F.countsForRanking({ settings: null }), true);
    assert.equal(F.countsForRanking({}), true);
  },

  'quét D43: file ghi ranking_snapshots không đọc bảng tournament_* (nếu có phải gọi countsForRanking)'() {
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(ROOT, 'lib'));
    walk(path.join(ROOT, 'app', 'api'));
    const writers = files.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return /ranking_snapshots['"`]\s*\)\s*\.\s*(insert|upsert|update)/.test(source.replace(/\s+/g, ' '));
    });
    assert.ok(writers.length >= 1, 'đang có ít nhất một nơi ghi ranking_snapshots (save-snapshot)');
    for (const file of writers) {
      const source = fs.readFileSync(file, 'utf8');
      if (/from\(\s*['"`]tournament_/.test(source)) assert.ok(source.includes('countsForRanking'), `${path.relative(ROOT, file)} đọc tournament_* mà không gọi countsForRanking`);
    }
  },
});
