'use strict';
// Helper server thuần của route F1 (lib/tournament/friendlyServer.js): ánh xạ lỗi RPC → HTTP/mã ổn định,
// chiếu dòng RPC cho chủ nhà, kiểm tham số body, dựng/sắp lời mời cho CLB khách.

const { assert, lib, suite } = require('../_harness');

const server = lib('lib/tournament/friendlyServer.js');
const { FRIENDLY_ERROR_STATUS } = lib('lib/tournament/friendlyClubs.js');

const FORBIDDEN_GUEST_KEYS = ['group_id', 'captain_contact_profile_id', 'invite_token_hash', 'has_invite_link', 'settings', 'phone'];
function deepKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, out));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { out.add(key); deepKeys(item, out); }
  return out;
}

suite('f1 friendlyServer', {
  'ánh xạ lỗi RPC theo mã trong message; mã dài khớp trước (FRIENDLY_CLUB_NOT_FOUND ≠ CLUB_NOT_FOUND)'() {
    let out = server.rpcErrorPayload({ message: 'FRIENDLY_CLUB_NOT_FOUND', code: 'P0002' });
    assert.equal(out.status, 404);
    assert.equal(out.body.code, 'FRIENDLY_CLUB_NOT_FOUND');
    assert.equal(out.body.error, 'Không tìm thấy lời mời.');
    out = server.rpcErrorPayload({ message: 'CLUB_NOT_FOUND', code: 'P0002' });
    assert.equal(out.body.code, 'CLUB_NOT_FOUND');
    for (const code of Object.keys(FRIENDLY_ERROR_STATUS)) {
      const mapped = server.rpcErrorPayload({ message: code, code: 'PH409' });
      assert.equal(mapped.body.code, code, code);
      assert.equal(mapped.status, FRIENDLY_ERROR_STATUS[code], code);
    }
  },

  'params: DETAIL JSON của RPC + tham số route (hạn mức từ entitlement)'() {
    let out = server.rpcErrorPayload({ message: 'FRIENDLY_CLUB_LIMIT_REACHED', code: 'PH409', details: '{"max": 1, "used": 1}' }, { max: 1 });
    assert.equal(out.status, 409);
    assert.deepEqual(out.body.params, { max: 1, used: 1 });
    assert.ok(out.body.error.includes('tối đa 1 CLB khách'));
    out = server.rpcErrorPayload({ message: 'FRIENDLY_ATHLETE_ID_MISSING', code: '22023', details: '{"name": "Nguyễn Văn A", "memberId": "991"}' });
    assert.equal(out.body.error, 'Nguyễn Văn A chưa có hồ sơ thi đấu.');
    out = server.rpcErrorPayload({ message: 'FRIENDLY_QUOTA_EXCEEDED', code: '22023', details: 'không phải JSON' });
    assert.equal(out.body.params, undefined);
  },

  'lỗi không mang mã: theo SQLSTATE, lỗi lạ → 500 không lộ chi tiết SQL'() {
    assert.equal(server.rpcErrorPayload({ message: 'x', code: 'PH409' }).status, 409);
    assert.equal(server.rpcErrorPayload({ message: 'x', code: 'P0002' }).status, 404);
    const unknown = server.rpcErrorPayload({ message: 'relation "foo" does not exist', code: '42P01' });
    assert.equal(unknown.status, 500);
    assert.equal(unknown.body.code, 'FRIENDLY_MUTATION_FAILED');
    assert.equal(unknown.body.error.includes('foo'), false);
  },

  'blocker đầu tiên → 400 + danh sách blockers'() {
    const out = server.blockerPayload([{ code: 'FRIENDLY_ATHLETE_ID_MISSING', params: { name: 'Trần B', memberId: '2' } }, { code: 'FRIENDLY_ROSTER_EMPTY' }]);
    assert.equal(out.status, 400);
    assert.equal(out.body.code, 'FRIENDLY_ATHLETE_ID_MISSING');
    assert.equal(out.body.error, 'Trần B chưa có hồ sơ thi đấu.');
    assert.equal(out.body.blockers.length, 2);
  },

  'projectHostClubRow: dòng RPC (không băm, có has_invite_link) → HostClubView không lộ roster_draft/băm'() {
    const view = server.projectHostClubRow({
      id: 881, group_id: 59, tournament_id: 5, club_id: 19, invitation_status: 'invited', quota: 3, version: 2,
      roster_draft: { memberIds: ['1'] }, has_invite_link: true, invite_token_issued_at: '2026-09-26T02:12:00Z', captain_contact_profile_id: 7,
    }, { clubName: 'CLB 19' });
    assert.equal(view.hasInviteLink, true);
    assert.equal(view.inviteLinkIssuedAt, '2026-09-26T02:12:00Z');
    assert.equal(view.name, 'CLB 19');
    const keys = deepKeys(view);
    for (const key of ['roster_draft', 'rosterDraft', 'invite_token_hash', 'has_invite_link', 'captain_contact_profile_id', 'group_id']) {
      assert.equal(keys.has(key), false, key);
    }
    const noLink = server.projectHostClubRow({ id: 1, club_id: 19, group_id: 59, invitation_status: 'withdrawn', has_invite_link: false, invite_token_issued_at: 'x' });
    assert.equal(noLink.hasInviteLink, false);
    assert.equal(noLink.inviteLinkIssuedAt, null);
    const fromDb = server.projectHostClubRow({ id: 1, club_id: 19, group_id: 59, invitation_status: 'invited', invite_token_hash: 'a'.repeat(64), invite_token_issued_at: 'y' });
    assert.equal(fromDb.hasInviteLink, true);
  },

  'kiểm body: id, quota, ghi chú mời'() {
    assert.equal(server.positiveId('12'), 12);
    assert.equal(server.positiveId(12), 12);
    for (const bad of [0, -1, '1.5', 'abc', null, undefined, '', 1.5, '9007199254740993']) assert.equal(server.positiveId(bad), null, String(bad));
    assert.deepEqual(server.parseQuotaInput(undefined), { ok: true, quota: null });
    assert.deepEqual(server.parseQuotaInput(null), { ok: true, quota: null });
    assert.deepEqual(server.parseQuotaInput(''), { ok: true, quota: null });
    assert.deepEqual(server.parseQuotaInput(3), { ok: true, quota: 3 });
    assert.deepEqual(server.parseQuotaInput('32'), { ok: true, quota: 32 });
    for (const bad of [0, 33, 2.5, 'abc', true, {}]) assert.deepEqual(server.parseQuotaInput(bad), { ok: false, code: 'FRIENDLY_QUOTA_INVALID' }, String(bad));
    assert.deepEqual(server.parseInvitationNote(undefined), { ok: true, note: null });
    assert.deepEqual(server.parseInvitationNote('  Mời giao lưu  '), { ok: true, note: 'Mời giao lưu' });
    assert.deepEqual(server.parseInvitationNote('x'.repeat(501)), { ok: false, code: 'SETUP_PAYLOAD_INVALID' });
    assert.deepEqual(server.parseInvitationNote(5), { ok: false, code: 'SETUP_PAYLOAD_INVALID' });
  },

  'hostActionPayload: note/quota đi vào payload RPC, action lạ bị từ chối'() {
    assert.deepEqual(server.hostActionPayload('approve', {}), { ok: true, payload: {} });
    assert.deepEqual(server.hostActionPayload('request_changes', { note: '  Cặp 2 thiếu người  ' }), { ok: true, payload: { note: 'Cặp 2 thiếu người' } });
    assert.deepEqual(server.hostActionPayload('request_changes', { note: 'a' }), { ok: false, code: 'FRIENDLY_NOTE_REQUIRED' });
    assert.deepEqual(server.hostActionPayload('set_quota', { quota: 4 }), { ok: true, payload: { quota: 4 } });
    assert.deepEqual(server.hostActionPayload('set_quota', { quota: null }), { ok: true, payload: { quota: null } });
    assert.deepEqual(server.hostActionPayload('set_quota', {}), { ok: false, code: 'FRIENDLY_QUOTA_INVALID' });
    assert.deepEqual(server.hostActionPayload('submit_roster', {}), { ok: false, code: 'SETUP_PAYLOAD_INVALID' });
    assert.deepEqual(server.hostActionPayload('rotate_link', { inviteTokenHash: 'f'.repeat(64) }), { ok: true, payload: {} }, 'băm từ body bị bỏ');
    assert.deepEqual([...server.HOST_ACTIONS], ['approve', 'request_changes', 'remove', 'set_quota', 'rotate_link']);
    assert.deepEqual([...server.GUEST_ACTIONS], ['accept', 'decline', 'save_roster', 'submit_roster', 'unsubmit', 'withdraw']);
  },

  'guestInvitationView: cửa sổ, nhãn thể thức, publicUrl chỉ khi đã chốt và không riêng tư; không lộ khoá cấm'() {
    const row = { id: 881, group_id: 59, tournament_id: 5, club_id: 19, invitation_status: 'accepted', quota: 3, version: 4,
      roster_draft: { memberIds: ['1', '2'], pairs: [{ pairId: 'p1', participantRefs: ['member:1', 'member:2'] }], unpairedRefs: [] } };
    const tournament = { id: 5, group_id: 59, name: 'Giao hữu', event_date: '2026-10-12', location: 'Sân A', status: 'draft',
      settings: { organizer_mode: 'friendly', start_time: '07:30', friendly: { registrationDeadline: '2026-10-05T16:59:00Z', registrationLockedAt: null } },
      visibility: 'unlisted', public_slug: 'giao-huu-abc' };
    const open = server.guestInvitationView({ row, tournament, hostClub: { name: 'CLB 59' }, division: { roster_lock_status: 'open', format_key: 'group_knockout' }, now: new Date('2026-10-01T00:00:00Z') });
    assert.equal(open.window.open, true);
    assert.equal(open.canEdit, true);
    assert.equal(open.publicUrl, null);
    assert.ok(open.formatLabel && typeof open.formatLabel === 'string');
    const done = server.guestInvitationView({ row, tournament, hostClub: { name: 'CLB 59' }, division: { roster_lock_status: 'locked' }, now: new Date('2026-10-01T00:00:00Z') });
    assert.equal(done.finalized, true);
    assert.equal(done.publicUrl, '/giai-dau/v2/giao-huu-abc');
    const hidden = server.guestInvitationView({ row, tournament: { ...tournament, visibility: 'private' }, hostClub: {}, division: { roster_lock_status: 'locked' }, now: new Date() });
    assert.equal(hidden.publicUrl, null);
    const keys = deepKeys(open);
    for (const key of FORBIDDEN_GUEST_KEYS) assert.equal(keys.has(key), false, key);
    const item = server.guestListItem(open);
    assert.deepEqual(Object.keys(item).sort(), ['finalized', 'hostClub', 'id', 'pairCount', 'publicUrl', 'quota', 'status', 'statusLabel', 'tournament', 'window'].sort());
  },

  'sắp hộp lời mời: cần làm → đang mở → đã chốt → từ chối/rút'() {
    const view = (id, status, finalized = false, eventDate = '2026-10-12') => ({ id, status, finalized, tournament: { eventDate } });
    const sorted = server.sortGuestInvitations([
      view(1, 'declined'), view(2, 'approved', true), view(3, 'accepted'), view(4, 'changes_requested'), view(5, 'withdrawn'),
      view(6, 'invited', false, '2026-10-01'), view(7, 'roster_submitted'),
    ]);
    assert.deepEqual(sorted.map((item) => item.id), [6, 4, 3, 7, 2, 1, 5]);
  },
});
