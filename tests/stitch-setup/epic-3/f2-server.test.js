'use strict';
// Epic 3 F2 — lớp server (lib/tournament/friendlyServer.js) mà route preview / finalize / setup / standings / public dùng:
// loadFriendlyContext (I/O → buildFriendlyContext), khối friendly của view setup, BXH CLB, allowlist công khai, D50.

const { assert, lib } = require('../_harness');
const { fakeDb, has } = require('./_fakeDb');
const { guestRow, hostDraft, GROUP_NAMES } = require('./_f2Fixtures');

const server = lib('lib/tournament/friendlyServer.js');
const { effectivePairs, entryClubs, finalizePlanPayload } = lib('lib/tournament/friendlySetup.js');
const { CLUB_COLORS } = lib('lib/tournament/friendlyStandings.js');

const T = { id: 500, group_id: 59, name: 'Giao hữu 59', settings: { organizer_mode: 'friendly' }, visibility: 'private', public_slug: null };
const hostRow = { id: 880, group_id: 59, tournament_id: 500, club_id: 59, external_club_id: null, invitation_status: 'approved', version: 1 };
const guestMembers = [101, 102, 103, 104, 105, 106];
function tables(overrides = {}) {
  return {
    tournaments: [T, { ...T, id: 501, settings: { organizer_mode: 'internal' } }],
    tournament_clubs: [hostRow, guestRow(881, 19, { members: guestMembers }), guestRow(882, 20, { status: 'declined' }),
      { ...guestRow(990, 21, { members: [201, 202] }), group_id: 77, tournament_id: 999 }],
    groups: [{ id: 59, name: 'CLB Test 23.9.2026' }, ...Object.entries(GROUP_NAMES).map(([id, name]) => ({ id: Number(id), name }))],
    athletes: [...[1, 2, 3, 4, 5, 6, 7, 8].map((m) => ({ id: 1000 + m, legacy_club_member_id: m, display_name: `Chủ ${m}` })),
      ...guestMembers.map((m) => ({ id: 2000 + m, legacy_club_member_id: m, display_name: `Khách ${m}` }))],
    ...overrides,
  };
}
const deepKeys = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, out));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { out.add(key); deepKeys(item, out); }
  return out;
};
const cases = {};

cases['loadFriendlyContext: giải nội bộ → null, không đọc tournament_clubs'] = async () => {
  const db = fakeDb(tables());
  assert.equal(await server.loadFriendlyContext(db, { groupId: 59, tournamentId: 501 }), null);
  assert.equal(await server.loadFriendlyContext(db, { groupId: 60, tournamentId: 500 }), null, 'giải của group khác');
  assert.equal(db.log.some((q) => q.table === 'tournament_clubs'), false);
  assert.ok(db.log.every((q) => q.table !== 'tournaments' || (has(q, 'eq', 'group_id') && has(q, 'eq', 'id'))));
};

cases['loadFriendlyContext: shape của buildFriendlyContext; cột không roster_draft/băm; scope group + giải'] = async () => {
  const db = fakeDb(tables());
  const draft = hostDraft(4);
  const ctx = await server.loadFriendlyContext(db, { groupId: 59, tournamentId: 500, draft });
  assert.deepEqual(ctx.approvedPairs.map((p) => p.pairId), ['c881.7.pair_1', 'c881.7.pair_2', 'c881.7.pair_3']);
  assert.equal(ctx.maxGuestClubs, 1);
  assert.equal(ctx.hostClubName, 'CLB Test 23.9.2026');
  assert.deepEqual(ctx.clubRows.map((row) => row.id), [881, 882], 'bỏ dòng chủ nhà, không lẫn giải khác');
  assert.equal(ctx.athletes.filter((a) => a.clubKey === 'host').length, 8);
  assert.equal(ctx.athletes.filter((a) => a.clubKey === 'tc:881').length, 6);
  const clubQuery = db.log.find((q) => q.table === 'tournament_clubs');
  assert.equal(/roster_draft|invite_token_hash/.test(clubQuery.select), false);
  assert.ok(has(clubQuery, 'eq', 'group_id') && has(clubQuery, 'eq', 'tournament_id'));
  assert.equal(db.log.filter((q) => q.table === 'athletes').length, 1, 'một truy vấn athletes');
  const pairs = effectivePairs(draft, ctx);
  assert.equal(pairs.length, 7);
  assert.deepEqual(new Set(Object.values(entryClubs(pairs))), new Set(['host', 'tc:881']));
};

cases['finalizePlanPayload: nội bộ đúng p_plan cũ; friendly thêm maxGuestClubs từ ctx (server)'] = async () => {
  const draft = hostDraft(2);
  const plan = { fingerprint: 'x', matches: [] };
  const internal = finalizePlanPayload({ plan, pairs: effectivePairs(draft, null), friendly: null });
  assert.deepEqual(internal, { ...plan, pairs: draft.pairs.map((p) => ({ pairId: p.pairId, refs: p.participantRefs })) });
  const ctx = await server.loadFriendlyContext(fakeDb(tables()), { groupId: 59, tournamentId: 500, draft });
  const friendly = finalizePlanPayload({ plan, pairs: effectivePairs(draft, ctx), friendly: ctx });
  assert.deepEqual(friendly.friendly, { maxGuestClubs: 1 });
  assert.equal(friendly.pairs.length, 5);
};

cases['organizerModeMismatch: bản nháp và settings phải cùng chế độ'] = () => {
  assert.equal(server.organizerModeMismatch({ tournament: { organizerMode: 'friendly' } }, { any: 1 }), false);
  assert.equal(server.organizerModeMismatch({ tournament: { organizerMode: 'internal' } }, null), false);
  assert.equal(server.organizerModeMismatch({ tournament: { organizerMode: 'friendly' } }, null), true);
  assert.equal(server.organizerModeMismatch({ tournament: { organizerMode: 'internal' } }, { any: 1 }), true);
};

cases['friendlySetupView (§3.5): chỉ tên / trạng thái / số cặp / màu; không memberId, club_id, băm'] = async () => {
  const ctx = await server.loadFriendlyContext(fakeDb(tables()), { groupId: 59, tournamentId: 500, draft: hostDraft(4) });
  const view = server.friendlySetupView(ctx, { tournament: T, rosterLockStatus: 'open' });
  assert.deepEqual(view.limit, { max: 1, used: 1, remaining: 0, reached: true, upgradeHint: view.limit.upgradeHint });
  assert.equal(view.window.open, true);
  assert.deepEqual(view.clubs.map((c) => [c.tournamentClubId, c.status, c.pairCount]), [[881, 'approved', 3], [882, 'declined', 0]]);
  assert.equal(view.clubs[0].color, CLUB_COLORS[1]);
  assert.deepEqual(view.hostClub, { name: 'CLB Test 23.9.2026', color: CLUB_COLORS[0] });
  assert.deepEqual(view.approvedPairs[0].members, [{ name: 'Khách 101' }, { name: 'Khách 102' }]);
  const keys = deepKeys(view);
  for (const key of ['memberId', 'memberIds', 'club_id', 'clubId', 'roster_submitted', 'invite_token_hash', 'phone', 'participantRefs']) {
    assert.equal(keys.has(key), false, key);
  }
  assert.equal(server.friendlySetupView(null), null);
};

function standingsTables() {
  const entries = [
    { id: 5001, group_id: 59, division_id: 700, tournament_club_id: 880 }, { id: 5002, group_id: 59, division_id: 700, tournament_club_id: 880 },
    { id: 5003, group_id: 59, division_id: 700, tournament_club_id: 881 }, { id: 5004, group_id: 59, division_id: 700, tournament_club_id: 881 },
  ];
  const match = (id, a, b, winner, status = 'finalized') => ({ id, group_id: 59, division_id: 700, entry_a_id: a, entry_b_id: b, winner_entry_id: winner, status });
  return tables({
    tournament_divisions: [{ id: 700, group_id: 59, tournament_id: 500, competition_template: 'unified_setup_draft_v2', roster_lock_status: 'locked' }],
    tournament_entries: entries,
    tournament_matches: [match(1, 5001, 5003, 5001), match(2, 5002, 5004, 5004), match(3, 5001, 5002, 5002), match(4, 5001, 5004, null, 'pending')],
    tournament_games: [{ group_id: 59, match_id: 1, score_a: 11, score_b: 7 }, { group_id: 59, match_id: 2, score_a: 5, score_b: 11 }, { group_id: 59, match_id: 3, score_a: 11, score_b: 9 }],
  });
}

cases['loadFriendlyClubStandings: chủ nhà + khách đã duyệt; trận nội bộ / chưa chốt không tính; scope group'] = async () => {
  const db = fakeDb(standingsTables());
  const out = await server.loadFriendlyClubStandings(db, { tournament: { id: 500, group_id: 59 } });
  assert.equal(out.finalized, true);
  assert.deepEqual(out.clubs.map((c) => [c.tournamentClubId, c.isHost, c.color]), [[880, true, CLUB_COLORS[0]], [881, false, CLUB_COLORS[1]]]);
  assert.deepEqual(out.entryClubs, { 5001: 880, 5002: 880, 5003: 881, 5004: 881 });
  for (const row of out.rows) assert.equal(row.played, 2);
  assert.deepEqual(out.headToHead.wins, [1, 1]);
  assert.deepEqual(out.counts, { interclubDone: 2, internalDone: 1 });
  for (const query of db.log.filter((q) => q.table.startsWith('tournament_'))) assert.ok(has(query, 'eq', 'group_id'), query.table);
};

cases['publicFriendlyBlock: allowlist — không club_id / group id / logo / thành viên'] = async () => {
  const out = await server.loadFriendlyClubStandings(fakeDb(standingsTables()), { tournament: { id: 500, group_id: 59 } });
  const block = server.publicFriendlyBlock({ ...out, clubs: out.clubs.map((c) => ({ ...c, club_id: 19, logo_url: 'data:x' })) });
  assert.deepEqual(Object.keys(block).sort(), ['clubStandings', 'clubs', 'entryClubs']);
  assert.deepEqual(Object.keys(block.clubs[0]).sort(), ['color', 'isHost', 'name', 'tournamentClubId']);
  assert.deepEqual(Object.keys(block.clubStandings).sort(), ['headToHead', 'rows']);
  const keys = deepKeys(block);
  for (const key of ['club_id', 'clubId', 'group_id', 'logo_url', 'logoUrl', 'members', 'counts', 'finalized']) assert.equal(keys.has(key), false, key);
  assert.equal(server.publicFriendlyBlock(null), null);
};

cases['publishFriendlyTournament (D50): private → unlisted + slug có điều kiện visibility = private; đã công khai thì không ghi'] = async () => {
  const db = fakeDb(tables());
  const url = await server.publishFriendlyTournament(db, { groupId: 59, tournamentId: 500 });
  const update = db.log.find((q) => q.update);
  assert.equal(update.update.visibility, 'unlisted');
  assert.match(update.update.public_slug, /^giao-huu-59-[a-f0-9]{18}$/);
  assert.ok(update.filters.some(([op, f, v]) => op === 'eq' && f === 'visibility' && v === 'private') && has(update, 'eq', 'group_id'));
  assert.equal(url, `/giai-dau/v2/${update.update.public_slug}`);
  const again = fakeDb(tables({ tournaments: [{ ...T, visibility: 'unlisted', public_slug: 'co-san' }] }));
  assert.equal(await server.publishFriendlyTournament(again, { groupId: 59, tournamentId: 500 }), '/giai-dau/v2/co-san');
  assert.equal(again.log.some((q) => q.update), false);
};

// suite() của harness là đồng bộ; ca ở đây async nên chạy tuần tự rồi in cùng định dạng.
(async () => {
  let failed = 0;
  for (const [title, fn] of Object.entries(cases)) {
    try {
      await fn();
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${title}\n    ${String(error.message).split('\n').join('\n    ')}`);
    }
  }
  const total = Object.keys(cases).length;
  console.log(`${failed ? 'RED ' : 'ok  '} f2 friendlyServer: ${total - failed}/${total}`);
  if (failed) process.exitCode = 1;
})();
