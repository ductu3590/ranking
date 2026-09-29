'use strict';
// Epic 4 · C1 — hợp đồng lớp Next + route /api/player/* (spec lat-c1-danh-tinh.md §3, §4, §7). Đọc mã nguồn.

const { assert, read, exists, suite } = require('../_harness');

const norm = (text) => text.replace(/\r\n?/g, '\n');
const src = (file) => (exists(file) ? norm(read(file)) : '');
const ROUTES = {
  accounts: 'app/api/player/accounts/route.js',
  session: 'app/api/player/session/route.js',
  profile: 'app/api/player/profile/route.js',
};
const playerSession = src('lib/playerSession.js');
const publicRateLimit = src('lib/publicRateLimit.js');
const accounts = src(ROUTES.accounts);
const session = src(ROUTES.session);
const profile = src(ROUTES.profile);
const platformRoute = src('app/api/platform/session/route.js');

// Nội dung các lệnh trả JSON của route: không được chứa trường nhạy cảm.
function jsonCalls(code) {
  return [...code.matchAll(/(?:NextResponse\.json|playerJson)\(([\s\S]*?)\)\s*;?\n/g)].map((m) => m[1]);
}

suite('C1 lớp Next: phiên VĐV', {
  'cookie player_session, cờ bảo mật đầy đủ': () => {
    assert.ok(playerSession, 'thiếu lib/playerSession.js');
    assert.ok(/PLAYER_SESSION_COOKIE = 'player_session'/.test(playerSession));
    assert.ok(/httpOnly: true/.test(playerSession));
    assert.ok(/sameSite: 'lax'/.test(playerSession));
    assert.ok(/secure: process\.env\.NODE_ENV === 'production'/.test(playerSession));
    assert.ok(/path: '\/'/.test(playerSession));
    for (const name of ['setPlayerSessionCookie', 'clearPlayerSessionCookie', 'requirePlayerSession', 'readSignedPlayerSession', 'issuePlayerSession', 'revokePlayerSession']) {
      assert.ok(new RegExp(`export (async )?function ${name}\\b`).test(playerSession), name);
    }
  },
  'không import phiên của hệ khác': () => {
    for (const forbidden of ['athleteSession', 'groupSession', 'platformSession']) {
      assert.ok(!new RegExp(`from ['"][^'"]*${forbidden}['"]`).test(playerSession), `lib/playerSession.js không được import ${forbidden}`);
    }
  },
  'đối chiếu DB: phiên + tài khoản qua getPlayerSessionState': () => {
    assert.ok(/from\('player_sessions'\)/.test(playerSession));
    assert.ok(/from\('player_accounts'\)/.test(playerSession));
    assert.ok(/getPlayerSessionState\(/.test(playerSession));
    assert.ok(/derivePlayerSessionSecret\(/.test(playerSession));
    assert.ok(/Cache-Control['"]?: ?['"]no-store/.test(playerSession), 'phản hồi phải no-store');
  },
  'bộ đếm công khai gọi RPC và fail-closed mặc định': () => {
    assert.ok(publicRateLimit, 'thiếu lib/publicRateLimit.js');
    assert.ok(/rpc\('consume_rate_limit'/.test(publicRateLimit));
    assert.ok(/failOpen/.test(publicRateLimit));
    assert.ok(/failOpen = false/.test(publicRateLimit), 'mặc định fail-closed');
    assert.ok(/bucketFor\(/.test(publicRateLimit) && /policyFor\(/.test(publicRateLimit));
  },
});

suite('C1 route /api/player/*', {
  'mỗi route force-dynamic, dùng service role, không import phiên hệ khác': () => {
    for (const [name, code] of Object.entries({ accounts, session, profile })) {
      assert.ok(code, `thiếu route ${name}`);
      assert.ok(/export const dynamic = 'force-dynamic'/.test(code), `${name}: force-dynamic`);
      assert.ok(/supabaseAdmin/.test(code), `${name}: service role`);
      for (const forbidden of ['athleteSession', 'groupSession', 'platformSession']) {
        assert.ok(!new RegExp(`from ['"][^'"]*${forbidden}['"]`).test(code), `${name} không được import ${forbidden}`);
      }
    }
  },
  'POST accounts: honeypot, giới hạn IP + SĐT trước khi băm, 409 khi trùng SĐT, 201 + cookie': () => {
    assert.ok(/parseRegisterInput\(/.test(accounts));
    const ip = accounts.indexOf("'register_ip'");
    const phone = accounts.indexOf("'register_phone'");
    const hash = accounts.indexOf('hashPassword(');
    assert.ok(ip > 0 && phone > ip && hash > phone, 'thứ tự: register_ip → register_phone → hashPassword');
    assert.ok(/23505/.test(accounts) && /PLAYER_PHONE_TAKEN/.test(accounts) && /409/.test(accounts));
    assert.ok(/201/.test(accounts) && /setPlayerSessionCookie\(/.test(accounts));
    assert.ok(/projectPlayerAccount\(/.test(accounts));
    assert.ok(/429/.test(accounts) || /rateLimited/.test(accounts));
  },
  'POST session: sai SĐT và sai mật khẩu cùng 401 PLAYER_LOGIN_FAILED, cân thời gian': () => {
    assert.ok(/parseLoginInput\(/.test(session));
    assert.ok(/'login'/.test(session));
    assert.ok(/verifyPassword\(/.test(session));
    assert.ok(/DUMMY_HASH|dummyHash/.test(session), 'phải verify với băm giả khi không có tài khoản');
    assert.ok(/PLAYER_LOGIN_FAILED/.test(session) && /401/.test(session));
    assert.ok(/status !== 'active'|status === 'disabled'/.test(session), 'tài khoản bị khóa không đăng nhập được');
    assert.ok(/setPlayerSessionCookie\(/.test(session));
  },
  'GET/DELETE session: phiên hiện tại và đăng xuất thu hồi bản ghi': () => {
    assert.ok(/export async function GET/.test(session));
    assert.ok(/export async function DELETE/.test(session));
    assert.ok(/revokePlayerSession\(/.test(session));
    assert.ok(/clearPlayerSessionCookie\(/.test(session));
    assert.ok(/'session_read_ip'/.test(session));
  },
  'profile: cần phiên, đổi mật khẩu kiểm mật khẩu cũ và thu hồi phiên': () => {
    assert.ok(/requirePlayerSession\(/.test(profile));
    assert.ok(/export async function GET/.test(profile) && /export async function PATCH/.test(profile));
    assert.ok(/parseProfilePatch\(/.test(profile));
    assert.ok(/verifyPassword\(/.test(profile) && /hashPassword\(/.test(profile));
    assert.ok(/access_version/.test(profile), 'đổi mật khẩu tăng access_version');
    assert.ok(/revoked_at/.test(profile), 'thu hồi phiên cũ');
    assert.ok(/'profile'/.test(profile));
  },
  'không route nào trả trường nhạy cảm': () => {
    for (const code of [accounts, session, profile]) {
      for (const call of jsonCalls(code)) {
        for (const secret of ['password_hash', 'phone_norm', 'athlete_id', 'access_version', 'session_key']) {
          assert.ok(!call.includes(secret), `JSON trả về không được chứa ${secret}: ${call.slice(0, 80)}`);
        }
      }
    }
  },
  'đăng nhập admin hệ thống dùng bộ đếm DB trước bộ đếm bộ nhớ': () => {
    assert.ok(/consumePublicRateLimit\(/.test(platformRoute));
    assert.ok(/'platform_login'/.test(platformRoute));
    assert.ok(platformRoute.indexOf('consumePublicRateLimit(') < platformRoute.indexOf('limiter.canAttempt'), 'bộ đếm DB phải chạy trước');
  },
});
