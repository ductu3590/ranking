const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { decideClubReadScope, CLUB_READ_UNAUTHORIZED } = require('../../lib/clubReadScopeCore');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Chính xác thứ getDefaultGroupContext() trả về: đây là ngữ cảnh khiến người gọi
// ẩn danh đọc được trọn dữ liệu CLB #1 qua các route đọc.
const defaultContext = {
  group_id: 1,
  group_code: 'PB246',
  group_name: 'Pickleball 246 Club',
  role: 'member',
  is_default: true,
  signed: false,
};

// ── Không có danh tính thì không có CLB nào để rơi về ───────────────────────
assert.deepStrictEqual(decideClubReadScope(), { ...CLUB_READ_UNAUTHORIZED });
assert.deepStrictEqual(decideClubReadScope({}), { ...CLUB_READ_UNAUTHORIZED });
assert.deepStrictEqual(
  decideClubReadScope({ athleteContext: null, clubSession: null }),
  { ...CLUB_READ_UNAUTHORIZED },
  'không cookie, không vé VĐV → 401 chứ không mở CLB mặc định',
);
assert.strictEqual(
  decideClubReadScope({ clubSession: defaultContext }).ok,
  false,
  'ngữ cảnh CLB mặc định KHÔNG được coi là quyền đọc — đây chính là lỗ hổng đang vá',
);
assert.strictEqual(decideClubReadScope({ athleteContext: defaultContext }).ok, false);
assert.strictEqual(decideClubReadScope({ clubSession: { ...defaultContext, is_default: false } }).ok, false, 'signed:false vẫn bị chặn');
assert.strictEqual(decideClubReadScope({ clubSession: { ...defaultContext, signed: undefined } }).ok, false, 'is_default:true vẫn bị chặn');

// ── group_id phải là số nguyên dương thật ───────────────────────────────────
for (const bad of [null, undefined, '', 0, -3, 1.5, 'abc', {}]) {
  assert.strictEqual(
    decideClubReadScope({ clubSession: { group_id: bad, role: 'admin' } }).ok,
    false,
    `group_id ${JSON.stringify(bad)} không được mở quyền đọc`,
  );
}

// ── Phiên CLB hợp lệ vẫn đọc được như trước ─────────────────────────────────
const clubSession = { group_id: 7, group_code: 'ABC123', role: 'admin' };
assert.deepStrictEqual(
  decideClubReadScope({ clubSession }),
  { ok: true, groupId: 7, role: 'admin', context: clubSession },
);
assert.strictEqual(decideClubReadScope({ clubSession: { group_id: '7', role: 'member' } }).groupId, 7, 'group_id dạng chuỗi vẫn nhận');

// ── Vé VĐV ưu tiên hơn phiên CLB dùng chung còn sót trên trình duyệt ────────
const athleteContext = { group_id: 9, role: 'athlete', signed: true };
const athleteWins = decideClubReadScope({ athleteContext, clubSession });
assert.strictEqual(athleteWins.groupId, 9, 'vé VĐV thắng phiên CLB còn sót lại');
assert.strictEqual(athleteWins.role, 'athlete');
// Vé VĐV hỏng thì rơi về phiên CLB, KHÔNG rơi về CLB mặc định.
assert.strictEqual(decideClubReadScope({ athleteContext: { group_id: null }, clubSession }).groupId, 7);
assert.strictEqual(decideClubReadScope({ athleteContext: { group_id: null } }).ok, false);

// ── Hợp đồng: route đọc dữ liệu riêng không được dùng helper có fallback ────
const PRIVATE_READ_ROUTES = [
  'app/api/club/transactions/route.js',
  'app/api/club/members/route.js',
  'app/api/club/events/route.js',
  'app/api/club/bxh/share-image/route.js',
];
for (const file of PRIVATE_READ_ROUTES) {
  const source = read(file);
  assert.match(source, /await requireClubReadScope\(\)/, `${file} phải gác bằng requireClubReadScope`);
  assert.match(source, /if \(!scope\.ok\) return scope\.response;/, `${file} phải trả 401 khi không có danh tính`);
  for (const defaulting of ['getClubReadScopeId', 'getClubReadContext', 'getGroupIdForDatabase', 'getEffectiveGroupContext']) {
    assert.ok(
      !source.includes(defaulting),
      `${file} không được dùng ${defaulting} vì nhánh cuối của nó là CLB mặc định`,
    );
  }
  // Route ghi trên cùng file vẫn phải giữ guard admin.
  if (/export async function (POST|PATCH|DELETE)/.test(source)) {
    assert.match(source, /requireValidatedGroupAdmin\(\)/, `${file} phải giữ guard admin cho đường ghi`);
  }
}

// getClubReadScopeId đã bị bỏ hẳn: để lại thì sớm muộn có route mới dùng lại.
const contextLib = read('lib/clubReadContext.js');
assert.ok(
  !/export\s+(async\s+)?function\s+getClubReadScopeId/.test(contextLib),
  'getClubReadScopeId phải bị gỡ khỏi clubReadContext để không ai dùng lại',
);
assert.match(contextLib, /export async function requireClubReadScope\(\)/);
assert.ok(
  !/requireClubReadScope[\s\S]*getDefaultGroupContext\(\)/.test(contextLib),
  'requireClubReadScope không được rơi về ngữ cảnh CLB mặc định',
);

// Branding vẫn là route công khai có chủ đích: nó tự xử lý is_default và chỉ trả
// thương hiệu chung, không chạm vào dữ liệu CLB.
const branding = read('app/api/club/branding/route.js');
assert.match(branding, /context\.is_default/, 'branding phải xử lý tường minh ngữ cảnh mặc định');

console.log('phase 1 club read scope ok');
