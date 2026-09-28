'use strict';
// Vá lỗi có sẵn (a): PATCH /api/tournament-v2/tournaments ghi đè cả cột settings → xoá mất khoá do server quản lý
// (organizer_mode, friendly: hạn chót / khoá đăng ký). Spec Epic 3 F1 §6.5, README §7.6.

const { assert, read, lib, suite } = require('../_harness');

const route = read('app/api/tournament-v2/tournaments/route.js').replace(/\r\n?/g, '\n');
const patch = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function DELETE'));
const { preserveServerOwnedSettings, SERVER_OWNED_SETTINGS_KEYS } = lib('lib/tournament/friendlyClubs.js');

suite('f1 PATCH /tournaments giữ settings do server quản lý', {
  'PATCH đọc settings hiện có (cùng group_id) và gộp qua preserveServerOwnedSettings'() {
    assert.ok(route.includes('preserveServerOwnedSettings'), 'import từ friendlyClubs');
    assert.ok(/'settings' in body/.test(patch), 'chỉ khi body có settings');
    const read = patch.indexOf(".select('settings')");
    const merge = patch.indexOf('preserveServerOwnedSettings(');
    const write = patch.indexOf('.update(payload)');
    assert.ok(read >= 0 && merge > read && write > merge, 'đọc → gộp → ghi');
    const readChunk = patch.slice(read, read + 200);
    assert.ok(readChunk.includes(".eq('group_id', adminCheck.groupId)"), 'đọc settings trong đúng CLB');
  },

  'gộp: client không đổi/xoá được organizer_mode và friendly; khoá khác theo client'() {
    assert.deepEqual([...SERVER_OWNED_SETTINGS_KEYS], ['organizer_mode', 'friendly']);
    const current = { organizer_mode: 'friendly', friendly: { registrationDeadline: '2026-10-05T16:59:00Z', registrationLockedAt: null }, poster_url: 'a' };
    assert.deepEqual(preserveServerOwnedSettings(current, { poster_url: 'b', start_time: '07:30' }),
      { poster_url: 'b', start_time: '07:30', organizer_mode: 'friendly', friendly: current.friendly });
    assert.deepEqual(preserveServerOwnedSettings(current, { organizer_mode: 'internal', friendly: null }),
      { organizer_mode: 'friendly', friendly: current.friendly });
    // Giải cũ chưa có khoá server: client không tự đặt được.
    assert.deepEqual(preserveServerOwnedSettings({ poster_url: 'a' }, { organizer_mode: 'friendly', friendly: { registrationLockedAt: 'x' } }), {});
    assert.deepEqual(preserveServerOwnedSettings(current, null), { organizer_mode: 'friendly', friendly: current.friendly });
  },
});
