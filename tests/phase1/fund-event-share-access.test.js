const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  createFundEventShareToken,
  verifyFundEventShareToken,
  maskMemberName,
  resolveFundEventScope,
  presentFundEvent,
} = require('../../lib/fundEventShare');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const secret = 'phase1-fund-share-secret';

// Hai CLB khác nhau; id sự kiện là bigint tăng dần nên người ngoài đoán được.
const eventOwnClub = {
  id: 7,
  group_id: 1,
  title: 'Quỹ tháng 3',
  amount_per_person: 50000,
  is_active: true,
  fund_event_participants: [
    { id: 11, member_id: 101, has_paid: true, paid_at: '2026-03-02T00:00:00Z', notes: 'CK Vietcombank', club_members: { id: 101, full_name: 'Nguyễn Văn An', is_active: true } },
    { id: 12, member_id: 102, has_paid: false, paid_at: null, notes: null, club_members: { id: 102, full_name: 'Trần Thị Bình', is_active: true } },
  ],
};
const eventOtherClub = { ...eventOwnClub, id: 8, group_id: 2 };

const sessionOwnClub = { group_id: 1, role: 'member' };
const sessionOtherClub = { group_id: 2, role: 'admin' };

// ── Token gắn chặt với (group_id, event_id) ─────────────────────────────────
const token = createFundEventShareToken({ groupId: 1, eventId: 7 }, secret);
assert.ok(token.length >= 32, 'token chia sẻ phải đủ dài để không đoán được');
assert.strictEqual(verifyFundEventShareToken(token, { groupId: 1, eventId: 7 }, secret), true);
assert.strictEqual(
  verifyFundEventShareToken(token, { groupId: 2, eventId: 7 }, secret),
  false,
  'token của CLB này không mở được sự kiện cùng id của CLB khác',
);
assert.strictEqual(
  verifyFundEventShareToken(token, { groupId: 1, eventId: 8 }, secret),
  false,
  'token không dùng lại được cho sự kiện khác trong cùng CLB',
);
assert.strictEqual(verifyFundEventShareToken(token, { groupId: 1, eventId: 7 }, 'secret-khac'), false);
assert.strictEqual(verifyFundEventShareToken('', { groupId: 1, eventId: 7 }, secret), false);
assert.strictEqual(verifyFundEventShareToken(token, { groupId: 1, eventId: 7 }, ''), false);

// ── Ai được đọc sự kiện của CLB khác ────────────────────────────────────────
assert.strictEqual(
  resolveFundEventScope({ event: eventOtherClub, session: sessionOwnClub, secret }),
  null,
  'phiên CLB 1 không đọc được sự kiện của CLB 2',
);
assert.strictEqual(
  resolveFundEventScope({ event: eventOtherClub, session: null, secret }),
  null,
  'người gọi không có phiên CLB không đọc được sự kiện',
);
assert.strictEqual(
  resolveFundEventScope({ event: eventOtherClub, session: sessionOwnClub, token, secret }),
  null,
  'cầm token của sự kiện CLB mình cũng không mở được sự kiện CLB khác',
);
assert.strictEqual(
  resolveFundEventScope({ event: eventOwnClub, session: sessionOwnClub, secret }),
  'club',
  'thành viên trong CLB vẫn đọc được đầy đủ như trước',
);
assert.strictEqual(
  resolveFundEventScope({ event: eventOwnClub, session: sessionOtherClub, token, secret }),
  'share',
  'người ngoài CLB cầm đúng link chia sẻ chỉ được bản rút gọn',
);
assert.strictEqual(
  resolveFundEventScope({ event: { ...eventOwnClub, is_active: false }, token, secret }),
  null,
  'đóng sự kiện là cách thu hồi link chia sẻ',
);

// Vé VĐV (athlete_session) là người đọc hợp lệ trong CLB ghi trên vé — nhưng
// cũng chỉ trong đúng CLB đó.
const athleteOwnClub = { group_id: 1, role: 'athlete', signed: true };
assert.strictEqual(
  resolveFundEventScope({ event: eventOwnClub, session: athleteOwnClub, secret }),
  'club',
  'VĐV đăng nhập tài khoản cá nhân vẫn xem được sự kiện CLB mình',
);
assert.strictEqual(
  resolveFundEventScope({ event: eventOtherClub, session: athleteOwnClub, secret }),
  null,
  'vé VĐV không mở được sự kiện của CLB khác',
);
assert.strictEqual(resolveFundEventScope({ event: null, session: sessionOwnClub, secret }), null);
assert.strictEqual(
  resolveFundEventScope({ event: { ...eventOwnClub, group_id: null }, session: { group_id: null }, secret }),
  null,
  'group_id thiếu không được coi là khớp phiên',
);

// ── Người ngoài CLB không bao giờ nhận được họ tên thật ─────────────────────
const shareView = presentFundEvent(eventOwnClub, 'share');
const shareJson = JSON.stringify(shareView);
assert.ok(!shareJson.includes('full_name'), 'bản chia sẻ không mang trường full_name');
assert.ok(!shareJson.includes('Nguyễn Văn An'), 'bản chia sẻ không mang họ tên đầy đủ');
assert.ok(!shareJson.includes('Trần Thị Bình'), 'bản chia sẻ không mang họ tên đầy đủ');
assert.ok(!shareJson.includes('club_members'), 'bản chia sẻ không lộ bản ghi thành viên CLB');
assert.ok(!shareJson.includes('member_id'), 'bản chia sẻ không lộ id thành viên để đối chiếu chéo');
assert.ok(!shareJson.includes('CK Vietcombank'), 'bản chia sẻ không lộ ghi chú thu chi');
assert.ok(!shareJson.includes('group_id'), 'bản chia sẻ không lộ CLB nào đang sở hữu sự kiện');
assert.deepStrictEqual(
  shareView.fund_event_participants.map((p) => [p.display_name, p.has_paid]),
  [['N. V. An', true], ['T. T. Bình', false]],
  'bản chia sẻ chỉ còn tên đã che và trạng thái đóng quỹ',
);
assert.strictEqual(shareView.title, 'Quỹ tháng 3');
assert.strictEqual(maskMemberName('An'), 'An');
assert.strictEqual(maskMemberName(''), 'Ẩn danh');
assert.strictEqual(presentFundEvent(eventOwnClub, null), null, 'không có quyền thì không dựng payload');

const clubView = presentFundEvent(eventOwnClub, 'club');
assert.strictEqual(clubView.fund_event_participants[0].display_name, 'Nguyễn Văn An');
assert.strictEqual(clubView.fund_event_participants[0].club_members.full_name, 'Nguyễn Văn An');

// ── Hợp đồng route + trang chia sẻ ──────────────────────────────────────────
const detailRoute = read('app/api/club/events/[id]/route.js');
assert.ok(
  !/NextResponse\.json\(\{\s*event:\s*data\s*\}\)/.test(detailRoute),
  'route không được trả thẳng bản ghi sự kiện chưa qua kiểm tra quyền',
);
assert.match(detailRoute, /getValidatedGroupSessionFromCookies\(\)/);
assert.match(detailRoute, /getAthleteClubContext\(\)/);
for (const defaulting of ['getGroupIdForDatabase', 'getEffectiveGroupContext', 'getClubReadScopeId', 'getClubReadContext']) {
  assert.ok(
    !detailRoute.includes(defaulting),
    `route đọc sự kiện không được dùng ${defaulting} vì nó rơi về CLB mặc định`,
  );
}
assert.match(detailRoute, /resolveFundEventScope\(/);
assert.match(detailRoute, /presentFundEvent\(event,\s*scope\)/);
assert.match(detailRoute, /if\s*\(!scope\)[\s\S]{0,120}status:\s*404/);

const listRoute = read('app/api/club/events/route.js');
assert.match(
  listRoute,
  /Number\(session\?\.group_id\)\s*===\s*Number\(groupId\)/,
  'chỉ phiên ký đúng CLB mới được phát token chia sẻ',
);

const sharePage = read('app/quy/su-kien/[id]/page.js');
assert.ok(
  !sharePage.includes('club_members?.full_name'),
  'trang chia sẻ đọc display_name do API nặn sẵn, không đọc thẳng full_name',
);
assert.match(sharePage, /searchParams.*\.get\('t'\)|URLSearchParams/);

console.log('phase 1 fund event share access ok');
