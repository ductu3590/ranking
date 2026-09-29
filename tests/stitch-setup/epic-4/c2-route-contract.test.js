'use strict';
// Epic 4 · C2 — hợp đồng route /api/tournament-v2/community/* và công khai (spec lat-c2 §4, D57–D60). Đọc mã nguồn.

const { assert, read, exists, suite } = require('../_harness');

const norm = (text) => text.replace(/\r\n?/g, '\n');
const src = (file) => (exists(file) ? norm(read(file)) : '');
const BASE = 'app/api/tournament-v2/community';
const ROUTES = {
  registrations: `${BASE}/registrations/route.js`,
  withdraw: `${BASE}/registrations/[id]/withdraw/route.js`,
  my: `${BASE}/my/route.js`,
  partnerLink: `${BASE}/partner-link/route.js`,
  join: `${BASE}/join/route.js`,
  invites: `${BASE}/invites/route.js`,
  inviteAction: `${BASE}/invites/[id]/route.js`,
  partnerBoard: `${BASE}/partner-board/route.js`,
};
const ADMIN = {
  tournaments: `${BASE}/admin/tournaments/route.js`,
  registrations: `${BASE}/admin/registrations/route.js`,
  action: `${BASE}/admin/registrations/[id]/route.js`,
};
const publicPairs = src('app/api/tournament-v2/public/community/[slug]/pairs/route.js');
const publicList = src('app/api/tournament-v2/public/community/route.js');
const publicRegistration = src('app/api/tournament-v2/public/registration/route.js');
const publicPairInvite = src('app/api/tournament-v2/public/pair-invite/route.js');
const server = src('lib/communityServer.js');
const adminServer = src('lib/communityAdminServer.js');

suite('C2 route VĐV', {
  'mỗi route force-dynamic và bắt buộc phiên VĐV': () => {
    for (const [name, file] of Object.entries(ROUTES)) {
      const code = src(file);
      assert.ok(code, `thiếu route ${name}: ${file}`);
      assert.ok(/export const dynamic = 'force-dynamic'/.test(code), `${name}: force-dynamic`);
      assert.ok(/requirePlayerSession\(\)/.test(code), `${name}: requirePlayerSession`);
      assert.ok(/if \(!auth\.ok\) return auth\.response;/.test(code), `${name}: trả 401 khi thiếu phiên`);
    }
  },
  'mọi ghi đi qua RPC nguyên tử, group_id/account_id lấy từ phiên chứ không từ client': () => {
    for (const name of ['registrations', 'withdraw', 'partnerLink', 'join', 'invites', 'inviteAction']) {
      const code = src(ROUTES[name]);
      assert.ok(/callCommunityRpc\(/.test(code), `${name}: dùng RPC`);
      assert.ok(/p_account_id: auth\.account\.id/.test(code) || /p_account_id: accountId/.test(code), `${name}: account từ phiên`);
      assert.ok(!/body\??\.(accountId|account_id|groupId|group_id)/.test(code), `${name}: không tin account/group từ body`);
      assert.ok(!/supabaseAdmin\.from\('tournament_registrations'\)\s*\.(insert|update|delete)/.test(code), `${name}: không ghi trực tiếp`);
    }
  },
  'đăng ký: honeypot, giới hạn theo tài khoản, kiểm domain rồi RPC community_register': () => {
    const code = src(ROUTES.registrations);
    assert.ok(/consumePublicRateLimit\('community_register'/.test(code));
    assert.ok(/PLAYER_HONEYPOT/.test(code));
    assert.ok(/validateCommunitySubmission\(/.test(code));
    assert.ok(/'community_register'/.test(code));
    assert.ok(code.indexOf('consumePublicRateLimit') < code.indexOf('validateCommunitySubmission'), 'giới hạn trước khi làm việc nặng');
    assert.ok(/, 201\)/.test(code));
  },
  'lời mời: giới hạn 3/giờ, phản hồi đồng nhất, chuẩn hóa SĐT trước RPC': () => {
    const code = src(ROUTES.invites);
    assert.ok(/consumePublicRateLimit\('community_invite'/.test(code));
    assert.ok(/normalizePhone\(/.test(code) && /COMMUNITY_PARTNER_PHONE_INVALID/.test(code));
    assert.ok(/'invite_registration'/.test(code) && /'invite'/.test(code));
    assert.ok(/communityJson\(\{ ok: true \}, 201\)/.test(code), 'phản hồi đồng nhất { ok: true }');
    assert.ok(!/invited|account_id|found|exists/i.test(code.split('communityJson({ ok: true }')[1] || ''), 'không phản chiếu kết quả tra cứu SĐT');
  },
  'link rủ: chỉ băm vào DB, token thô trả một lần, xem trước không lộ SĐT': () => {
    const link = src(ROUTES.partnerLink);
    assert.ok(/issuePartnerToken\(/.test(link) && /token_hash: tokenHash/.test(link));
    assert.ok(!/token_hash: rawToken/.test(link) && !/p_payload: \{ token: /.test(link));
    assert.ok(/partnerLinkPath\(rawToken\)/.test(link));
    const join = src(ROUTES.join);
    assert.ok(/hashPartnerToken\(/.test(join) && /isPartnerTokenShape\(/.test(join));
    assert.ok(/'community_join_by_link'/.test(join));
    assert.ok(!/phone/i.test(join), 'xem trước link không được chứa SĐT');
  },
  'bảng tìm bạn ghép chỉ chọn cột hiển thị': () => {
    assert.ok(/loadPartnerBoard\(/.test(src(ROUTES.partnerBoard)));
    const fn = server.slice(server.indexOf('export async function loadPartnerBoard'), server.indexOf('// ===== Trang giải công khai'));
    assert.ok(!/phone/i.test(fn), 'loadPartnerBoard không được chạm SĐT');
    assert.ok(/awaiting_partner/.test(fn) && /division_id/.test(fn));
  },
  'đơn của tôi: dữ liệu chỉ của chính tài khoản và không có SĐT': () => {
    const fn = server.slice(server.indexOf('export async function loadMyCommunity'), server.indexOf('async function describeInvites'));
    assert.ok(!/phone/i.test(fn), 'loadMyCommunity không chọn SĐT');
    const invites = server.slice(server.indexOf('async function describeInvites'), server.indexOf('// ===== Bảng tìm bạn ghép'));
    assert.ok(!/phone/i.test(invites), 'describeInvites không chọn SĐT');
    assert.ok(/no-store/.test(server));
  },
});

suite('C2 route công khai', {
  'trang giải công khai chỉ chọn cột an toàn và quét khóa cấm': () => {
    assert.ok(publicPairs, 'thiếu public/community/[slug]/pairs');
    assert.ok(/loadPublicCommunityTournament\(/.test(publicPairs));
    const fn = server.slice(server.indexOf('export async function loadPublicCommunityTournament'));
    assert.ok(/assertNoForbiddenKeys\(payload\)/.test(fn));
    assert.ok(/projectPublicPairs\(/.test(fn));
    assert.ok(!/phone|dob|player_account_id|track_token|athlete_id/.test(fn.replace(/assertNoForbiddenKeys[^\n]*/g, '')), 'không select cột nhạy cảm');
    assert.ok(/\.eq\('status', 'approved'\)/.test(fn), 'chỉ đơn đã duyệt');
  },
  'danh sách giải mở thêm bộ đếm và phí, loại giải đã chốt': () => {
    assert.ok(/approved_count/.test(publicList) && /entry_fee/.test(publicList));
    assert.ok(/'scheduled', 'live', 'completed', 'archived'/.test(publicList));
    assert.ok(!/phone|player_account_id/.test(publicList));
  },
  'D58: đăng ký ẩn danh cho giải cộng đồng bị chặn 401': () => {
    assert.ok(/organizer_mode === 'community'/.test(publicRegistration) && /PLAYER_SESSION_REQUIRED/.test(publicRegistration) && /status: 401/.test(publicRegistration));
    assert.ok(publicRegistration.indexOf('PLAYER_SESSION_REQUIRED') < publicRegistration.indexOf('validateSubmission('), 'chặn trước khi nhận dữ liệu');
    assert.ok(/player_account_id != null\) return null/.test(publicPairInvite), 'pair-invite cũ không dùng cho đơn có tài khoản');
  },
});

suite('C2 route admin', {
  'mỗi route admin bắt buộc admin hệ thống, không dùng phiên VĐV': () => {
    for (const [name, file] of Object.entries(ADMIN)) {
      const code = src(file);
      assert.ok(code, `thiếu route admin ${name}`);
      assert.ok(/export const dynamic = 'force-dynamic'/.test(code), `${name}: force-dynamic`);
      assert.ok(/requireCommunityAdmin\(\)/.test(code), `${name}: requireCommunityAdmin`);
      assert.ok(/if \(!admin\.ok\) return admin\.response;/.test(code), `${name}: trả 401/403`);
      assert.ok(!/playerSession/.test(code), `${name}: không đọc phiên VĐV`);
    }
    assert.ok(/requirePlatformAdmin\(\)/.test(adminServer) && !/playerSession/.test(adminServer));
  },
  'thao tác duyệt qua RPC với account admin từ phiên, có version': () => {
    const code = src(ADMIN.action);
    assert.ok(/'community_admin_action'/.test(code));
    assert.ok(/p_platform_account_id: admin\.accountId/.test(code));
    assert.ok(/p_version: version/.test(code) && /p_partner_registration_id: partner/.test(code));
    for (const action of ['admit', 'reject', 'remove', 'restore', 'withdraw', 'fee_confirm', 'fee_unconfirm', 'merge']) assert.ok(code.includes(`'${action}'`), action);
  },
  'sửa giải dùng requireTournamentAccess và ghi settings.open_registration': () => {
    const code = src(ADMIN.tournaments);
    assert.ok(/requireTournamentAccess\(\{ tournamentId: id, need: 'write' \}\)/.test(code));
    assert.ok(/open_registration: body\.openRegistration === true/.test(code));
    assert.ok(/organizer_type !== 'community'/.test(code), 'chỉ giải cộng đồng');
    assert.ok(/eq\('group_id', access\.groupId\)/.test(code), 'scope group_id từ quyền, không từ body');
  },
  'bảng duyệt: SĐT chỉ ở đây, cảnh báo trùng tên, hạng chờ theo waitlistView': () => {
    assert.ok(/phone_norm/.test(adminServer) && /duplicateName/.test(adminServer));
    assert.ok(/waitlistView\(/.test(adminServer) && /nextAdminActions\(/.test(adminServer));
    assert.ok(/organizer_type !== 'community'\) return null/.test(adminServer));
  },
});
