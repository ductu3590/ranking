'use strict';
// Epic 3 F1 §8 — normalizeClubRoster (roster_draft của CLB khách) + khoá normalizeDraft không đổi.

const crypto = require('node:crypto');
const { assert, lib, suite } = require('../_harness');
const { normalizeClubRoster, normalizeDraft, toSavePayload } = lib('lib/tournament/setupDraftV3.js');
const FIXTURES = require('./_draftFixtures');

const pair = (pairId, a, b, locked) => ({ pairId, participantRefs: [`member:${a}`, `member:${b}`], ...(locked ? { locked: true } : {}) });
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

// Băm tính trên code TRƯỚC F1 (commit 145f999). Đổi normalizeDraft ở lát sau (F2 organizerMode) thì cập nhật có chủ đích.
// F2 §3.1 (có chủ đích): chỉ fixture #7 (organizerMode 'friendly') đổi băm — trước F2 bị ép 'internal'. Băm cũ của #7
// giữ ở PRE_F2_FIXTURE7 và được kiểm lại bằng cách thay organizerMode của kết quả về 'internal'.
const NORMALIZE_HASHES = ['066c26a3d7d44805', '066c26a3d7d44805', 'b9b10a809a7f438d', '889b4c39a8810fe7', '469ac6387205dcbd', 'd4884a57405bbcb2', '761ea1a9d974ca97', 'c2d92b0334bda137'];
const KEEP_WS_HASHES = ['066c26a3d7d44805', '066c26a3d7d44805', 'b9b10a809a7f438d', '889b4c39a8810fe7', '469ac6387205dcbd', 'd4884a57405bbcb2', '761ea1a9d974ca97', '71bec3e2ccd5e610'];
const SAVE_HASHES = ['cf2d25823089db12', 'cf2d25823089db12', 'a5d2cef93ab69a12', 'ec4e30e9628975f1', '7ab3bd46fa455199', '367803ad72f625b0', '00e830660d418714', 'f6a22ab1b9e5c123'];
const PRE_F2_FIXTURE7 = { normalize: '9c20c02276e0ec56', keepWhitespace: '899c37ddac7b48ef', save: '58f915cd1e6dcd17' };

suite('f1 roster', {
  'rỗng / rác → shape đủ ba khóa'() {
    for (const raw of [null, undefined, 'x', [], 42, {}]) {
      assert.deepEqual(normalizeClubRoster(raw), { memberIds: [], pairs: [], unpairedRefs: [] }, JSON.stringify(raw));
    }
  },

  'roster hợp lệ giữ nguyên, locked chuẩn hoá boolean'() {
    const roster = normalizeClubRoster({ memberIds: ['1', '2', '3', '4'], pairs: [pair('a', 1, 2, true), pair('b', 3, 4)], unpairedRefs: [] });
    assert.deepEqual(roster, {
      memberIds: ['1', '2', '3', '4'],
      pairs: [{ pairId: 'a', participantRefs: ['member:1', 'member:2'], locked: true }, { pairId: 'b', participantRefs: ['member:3', 'member:4'], locked: false }],
      unpairedRefs: [],
    });
  },

  'memberIds qua MEMBER_ID_RE, bỏ trùng, không nhận khách'() {
    const roster = normalizeClubRoster({ memberIds: ['1', '1', '01', 'x', ' 2 ', 3, 'guest:g_abcdef12', '0'] });
    assert.deepEqual(roster.memberIds, ['1', '2', '3']);
    assert.deepEqual(roster.unpairedRefs, ['member:1', 'member:2', 'member:3']);
  },

  'ref guest: bị loại, cặp chứa nó bị tách, người còn lại về chưa ghép (D38)'() {
    const roster = normalizeClubRoster({
      memberIds: ['1', '2', '3'],
      pairs: [{ pairId: 'a', participantRefs: ['member:1', 'guest:g_abcdef12'] }, pair('b', 2, 3)],
      unpairedRefs: ['guest:g_abcdef12'],
    });
    assert.deepEqual(roster.pairs.map((p) => p.pairId), ['b']);
    assert.deepEqual(roster.unpairedRefs, ['member:1']);
    assert.equal(JSON.stringify(roster).includes('guest:'), false);
  },

  'guests/participants kiểu bản nháp chủ nhà không lọt vào roster khách'() {
    const roster = normalizeClubRoster({ participants: { memberIds: ['1', '2'], guests: [{ clientRef: 'g_abcdef12', displayName: 'Khách' }] }, memberIds: ['5', '6'], pairs: [pair('a', 5, 6)] });
    assert.deepEqual(Object.keys(roster), ['memberIds', 'pairs', 'unpairedRefs']);
    assert.deepEqual(roster.memberIds, ['5', '6']);
  },

  'bỏ một người giữa danh sách chỉ tách đúng một cặp, không tự ghép lại'() {
    const before = normalizeClubRoster({ memberIds: ['1', '2', '3', '4', '5', '6'], pairs: [pair('a', 1, 2), pair('b', 3, 4), pair('c', 5, 6)] });
    const after = normalizeClubRoster({ ...before, memberIds: ['1', '2', '4', '5', '6'] });
    assert.deepEqual(after.pairs, [before.pairs[0], before.pairs[2]]);
    assert.deepEqual(after.unpairedRefs, ['member:4']);
    const again = normalizeClubRoster({ ...after, memberIds: [...after.memberIds, '7'] });
    assert.deepEqual(again.pairs, after.pairs, 'thêm người không ghép lại gì');
    assert.deepEqual(again.unpairedRefs, ['member:4', 'member:7']);
  },

  'một người không ở hai cặp; pairId trùng bị loại'() {
    const roster = normalizeClubRoster({ memberIds: ['1', '2', '3', '4'], pairs: [pair('a', 1, 2), pair('b', 2, 3), pair('a', 3, 4)] });
    assert.deepEqual(roster.pairs.map((p) => p.pairId), ['a']);
    assert.deepEqual(roster.unpairedRefs, ['member:3', 'member:4']);
  },

  'trùng tên là hai người khác nhau (định danh theo id)'() {
    const roster = normalizeClubRoster({ memberIds: ['11', '12'], pairs: [pair('a', 11, 12)], memberNames: { 11: 'Nguyễn Văn A', 12: 'Nguyễn Văn A' } });
    assert.equal(roster.pairs.length, 1);
    assert.deepEqual(roster.pairs[0].participantRefs, ['member:11', 'member:12']);
    assert.equal('memberNames' in roster, false, 'tên do server snapshot lúc gửi, không từ client');
  },

  'idempotent'() {
    const once = normalizeClubRoster({ memberIds: ['1', '2', '3'], pairs: [pair('a', 1, 2)], unpairedRefs: ['member:3'] });
    assert.deepEqual(normalizeClubRoster(once), once);
  },

  'normalizeDraft KHÔNG đổi (băm fixture Lát 0 trước F1)'() {
    assert.equal(FIXTURES.length, NORMALIZE_HASHES.length);
    FIXTURES.forEach((fixture, index) => {
      assert.equal(hash(normalizeDraft(fixture)), NORMALIZE_HASHES[index], `normalizeDraft fixture #${index}`);
      assert.equal(hash(normalizeDraft(fixture, { keepWhitespace: true })), KEEP_WS_HASHES[index], `keepWhitespace fixture #${index}`);
      assert.equal(hash(toSavePayload(fixture)), SAVE_HASHES[index], `toSavePayload fixture #${index}`);
    });
  },

  'F2: fixture #7 chỉ khác trước F2 ở organizerMode (friendly được giữ)'() {
    const asInternal = (value) => ({ ...value, tournament: { ...value.tournament, organizerMode: 'internal' } });
    assert.equal(normalizeDraft(FIXTURES[7]).tournament.organizerMode, 'friendly');
    assert.equal(hash(asInternal(normalizeDraft(FIXTURES[7]))), PRE_F2_FIXTURE7.normalize);
    assert.equal(hash(asInternal(normalizeDraft(FIXTURES[7], { keepWhitespace: true }))), PRE_F2_FIXTURE7.keepWhitespace);
    assert.equal(hash(asInternal(toSavePayload(FIXTURES[7]))), PRE_F2_FIXTURE7.save);
  },
});
