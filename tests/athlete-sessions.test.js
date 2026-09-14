'use strict';

// Unit test cho phiên đăng nhập tài khoản VĐV: domain ký/verify vé, dịch vụ
// login/logout/profile với repository giả, và hợp đồng của các route handler.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { IdentityServiceError, ERROR_STATUS, isAthleteSessionError } = require('../lib/application/identity/errors');
const { buildClubSessionView } = require('../lib/clubSessionView');
const { hashPassword } = require('../lib/domain/identity/password');
const {
  ATHLETE_SESSION_MAX_AGE_MS,
  generateAthleteSessionKey,
  hashAthleteSessionKey,
  signAthleteSession,
  verifyAthleteSession,
  getAthleteSessionState,
  validateAthleteLoginInput,
} = require('../lib/domain/identity/athleteSession');
const {
  CREDENTIALS_MESSAGE,
  createAthleteLogin,
  createResolveAthleteSession,
  createAthleteLogout,
  createGetAthleteProfile,
  createUpdateAthleteContact,
} = require('../lib/application/identity/athleteSessions');

const SECRET = 'test-athlete-secret';
const NOW = 1_800_000_000_000;
const PASSWORD = 'matkhau-vdv-1';

function baseToken(overrides = {}) {
  return {
    accountId: 5,
    clubId: 7,
    athleteId: 21,
    membershipId: 11,
    sessionKey: 'session-key-du-dai-32-ky-tu-abcdef',
    accessVersion: 1,
    now: NOW,
    ...overrides,
  };
}

function accountRow(overrides = {}) {
  return {
    id: 5,
    login: 'tuan.nguyen',
    password_hash: hashPassword(PASSWORD, { iterations: 1000 }),
    display_name: 'Nguyễn Văn Tuấn',
    athlete_id: 21,
    club_id: 7,
    club_membership_id: 11,
    status: 'active',
    access_version: 1,
    ...overrides,
  };
}

function sessionRow(sessionKey, overrides = {}) {
  return {
    id: 900,
    account_id: 5,
    session_key_hash: hashAthleteSessionKey(sessionKey),
    issued_at: new Date(NOW - 1000).toISOString(),
    expires_at: new Date(NOW + 60_000).toISOString(),
    revoked_at: null,
    ...overrides,
  };
}

function baseRepository(overrides = {}) {
  const created = [];
  const revoked = [];
  const repository = {
    created,
    revoked,
    async findAthleteAccountForLogin(login) {
      return login === 'tuan.nguyen' ? accountRow() : null;
    },
    async findAthleteAccountById(id) {
      return Number(id) === 5 ? accountRow() : null;
    },
    async createAthleteAccountSession(input) {
      created.push(input);
      return { id: 900, account_id: input.accountId, issued_at: input.issuedAt, expires_at: input.expiresAt };
    },
    async findAthleteAccountSession(sessionKey, accountId) {
      if (Number(accountId) !== 5) return null;
      return sessionRow(sessionKey);
    },
    async revokeAthleteAccountSession(sessionKey, now) {
      revoked.push({ sessionKey, now });
      return true;
    },
    async findAthleteAccountProfile(accountId) {
      if (Number(accountId) !== 5) return null;
      return {
        account: { id: 5, login: 'tuan.nguyen', displayName: 'Nguyễn Văn Tuấn', status: 'active' },
        club: { id: 7, code: 'PICKHUB7', name: 'PickHub 7' },
        athlete: { id: 21, displayName: 'Nguyễn Văn Tuấn', status: 'linked' },
        membership: { id: 11, status: 'active', alias: 'Tuấn', effectiveFrom: '2026-01-01', effectiveTo: null },
      };
    },
    ...overrides,
  };
  return repository;
}

function expectCode(code) {
  return (error) => error instanceof IdentityServiceError && error.code === code;
}

function makeLogin(repository, overrides = {}) {
  return createAthleteLogin({
    repository,
    signSession: (input) => signAthleteSession(input, SECRET),
    now: () => NOW,
    ...overrides,
  });
}

function testSignAndVerify() {
  const cookie = signAthleteSession(baseToken(), SECRET);
  const payload = verifyAthleteSession(cookie, SECRET, NOW + 1000);
  assert.equal(payload.account_id, 5);
  assert.equal(payload.club_id, 7);
  assert.equal(payload.athlete_id, 21);
  assert.equal(payload.membership_id, 11);
  assert.equal(payload.session_version, 1);
  assert.equal(payload.expires_at, NOW + ATHLETE_SESSION_MAX_AGE_MS);

  // Sai khoá, sửa payload, thiếu chữ ký, hết hạn, chưa hiệu lực: đều phải null.
  assert.equal(verifyAthleteSession(cookie, 'khoa-khac', NOW + 1000), null);
  const [encoded, signature] = cookie.split('.');
  const forged = Buffer.from(JSON.stringify({ ...payload, account_id: 6 })).toString('base64url');
  assert.equal(verifyAthleteSession(`${forged}.${signature}`, SECRET, NOW + 1000), null);
  assert.equal(verifyAthleteSession(encoded, SECRET, NOW + 1000), null);
  assert.equal(verifyAthleteSession(cookie, SECRET, NOW + ATHLETE_SESSION_MAX_AGE_MS + 1), null);
  assert.equal(verifyAthleteSession(cookie, SECRET, NOW - 5000), null);
  assert.equal(verifyAthleteSession('', SECRET, NOW), null);
  assert.equal(verifyAthleteSession(cookie, '', NOW), null);

  // access_version lệch (admin đổi mật khẩu CLB / vô hiệu tài khoản) thì vé cũ chết.
  assert.equal(verifyAthleteSession(cookie, SECRET, NOW + 1000, { currentAccessVersion: 2 }), null);
  assert.ok(verifyAthleteSession(cookie, SECRET, NOW + 1000, { currentAccessVersion: 1 }));

  assert.throws(() => signAthleteSession(baseToken(), ''), /secret is required/);
  assert.throws(() => signAthleteSession(baseToken({ accountId: 0 }), SECRET), /accountId/);
  assert.throws(() => signAthleteSession(baseToken({ clubId: -1 }), SECRET), /clubId/);
  assert.throws(() => signAthleteSession(baseToken({ sessionKey: 'ngan' }), SECRET), /sessionKey/);
  assert.throws(() => signAthleteSession(baseToken({ expiresAt: NOW - 1 }), SECRET), /expiresAt/);

  // Khoá phiên sinh ra phải đủ dài và không lặp lại.
  const keys = new Set(Array.from({ length: 50 }, () => generateAthleteSessionKey()));
  assert.equal(keys.size, 50);
  assert.ok(generateAthleteSessionKey().length >= 32);
}

function testSessionState() {
  const token = verifyAthleteSession(signAthleteSession(baseToken(), SECRET), SECRET, NOW);
  const account = accountRow();
  const record = sessionRow(token.session_key);

  assert.equal(getAthleteSessionState({ token, sessionRecord: record, account, now: NOW }), 'active');
  assert.equal(getAthleteSessionState({ token: null, sessionRecord: record, account, now: NOW }), 'invalid');
  assert.equal(getAthleteSessionState({ token, sessionRecord: null, account, now: NOW }), 'invalid');
  assert.equal(getAthleteSessionState({ token, sessionRecord: record, account: null, now: NOW }), 'invalid');
  // Vé đúng chữ ký nhưng session_key không khớp bản ghi nào.
  assert.equal(getAthleteSessionState({
    token, sessionRecord: sessionRow('khoa-phien-khac-du-dai-32-ky-tu'), account, now: NOW,
  }), 'invalid');
  assert.equal(getAthleteSessionState({
    token, sessionRecord: sessionRow(token.session_key, { account_id: 6 }), account, now: NOW,
  }), 'invalid');

  assert.equal(getAthleteSessionState({
    token, sessionRecord: sessionRow(token.session_key, { revoked_at: new Date(NOW).toISOString() }), account, now: NOW,
  }), 'revoked');
  assert.equal(getAthleteSessionState({
    token, sessionRecord: record, account: accountRow({ status: 'disabled' }), now: NOW,
  }), 'revoked');
  assert.equal(getAthleteSessionState({
    token, sessionRecord: record, account: accountRow({ access_version: 2 }), now: NOW,
  }), 'revoked');
  // Hồ sơ bị chuyển sang CLB khác hoặc gắn athlete khác: vé cũ không còn giá trị.
  assert.equal(getAthleteSessionState({
    token, sessionRecord: record, account: accountRow({ club_id: 8 }), now: NOW,
  }), 'revoked');
  assert.equal(getAthleteSessionState({
    token, sessionRecord: record, account: accountRow({ athlete_id: 22 }), now: NOW,
  }), 'revoked');

  assert.equal(getAthleteSessionState({
    token, sessionRecord: sessionRow(token.session_key, { expires_at: new Date(NOW - 1).toISOString() }), account, now: NOW,
  }), 'expired');
}

function testLoginInputValidation() {
  assert.equal(validateAthleteLoginInput({ login: '', password: 'x' }).reason, 'credentials_required');
  assert.equal(validateAthleteLoginInput({ login: 'a', password: '' }).reason, 'credentials_required');
  assert.equal(validateAthleteLoginInput({ login: 'a'.repeat(31), password: 'x' }).reason, 'credentials_invalid');
  assert.equal(validateAthleteLoginInput({ login: 'a', password: 'x'.repeat(129) }).reason, 'credentials_invalid');
  const ok = validateAthleteLoginInput({ login: '  Tuan.Nguyen ', password: ' matkhau ' });
  assert.equal(ok.login, 'tuan.nguyen');
  // Mật khẩu không bị trim: khoảng trắng là ký tự hợp lệ trong mật khẩu.
  assert.equal(ok.password, ' matkhau ');
}

async function testLoginHappyPath() {
  const repository = baseRepository();
  const login = makeLogin(repository);
  const result = await login({ login: '  Tuan.Nguyen  ', password: PASSWORD });

  assert.equal(result.account.id, 5);
  assert.equal(result.account.login, 'tuan.nguyen');
  assert.equal(result.account.clubId, 7);
  assert.equal(result.account.membershipId, 11);
  assert.equal(result.expiresAt, NOW + ATHLETE_SESSION_MAX_AGE_MS);
  // Không được để lộ hash mật khẩu ra ngoài tầng dịch vụ.
  assert.equal(result.account.password_hash, undefined);
  assert.equal(result.account.passwordHash, undefined);

  assert.equal(repository.created.length, 1);
  const stored = repository.created[0];
  assert.equal(stored.accountId, 5);
  assert.equal(stored.issuedAt, NOW);
  assert.equal(stored.expiresAt, NOW + ATHLETE_SESSION_MAX_AGE_MS);

  const payload = verifyAthleteSession(result.cookieValue, SECRET, NOW + 1000);
  assert.equal(payload.account_id, 5);
  assert.equal(payload.club_id, 7);
  // Vé phải mang đúng khoá phiên đã ghi vào DB.
  assert.equal(payload.session_key, stored.sessionKey);
}

async function testLoginFailures() {
  // Login không tồn tại và mật khẩu sai đều trả cùng một mã + thông báo.
  const notFound = makeLogin(baseRepository());
  await assert.rejects(() => notFound({ login: 'khong.ton.tai', password: PASSWORD }), expectCode('ATHLETE_CREDENTIALS_INVALID'));
  await assert.rejects(() => notFound({ login: 'tuan.nguyen', password: 'sai-mat-khau' }), (error) => {
    assert.equal(error.code, 'ATHLETE_CREDENTIALS_INVALID');
    assert.equal(error.message, CREDENTIALS_MESSAGE);
    return true;
  });
  await assert.rejects(() => notFound({ login: '', password: '' }), expectCode('ATHLETE_CREDENTIALS_INVALID'));

  // Không tạo bản ghi phiên nào khi đăng nhập thất bại.
  const repository = baseRepository();
  const login = makeLogin(repository);
  await assert.rejects(() => login({ login: 'tuan.nguyen', password: 'sai' }), expectCode('ATHLETE_CREDENTIALS_INVALID'));
  assert.equal(repository.created.length, 0);

  // Tài khoản bị tạm ngưng: đúng mật khẩu vẫn không vào được.
  const disabled = makeLogin(baseRepository({
    async findAthleteAccountForLogin() { return accountRow({ status: 'disabled' }); },
  }));
  await assert.rejects(() => disabled({ login: 'tuan.nguyen', password: PASSWORD }), expectCode('ATHLETE_ACCOUNT_DISABLED'));
}

async function testResolveAndProfile() {
  const repository = baseRepository();
  const resolve = createResolveAthleteSession({ repository, now: () => NOW });
  const token = verifyAthleteSession(signAthleteSession(baseToken(), SECRET), SECRET, NOW);

  const resolved = await resolve(token);
  assert.equal(resolved.account.id, 5);
  assert.equal(resolved.account.displayName, 'Nguyễn Văn Tuấn');

  await assert.rejects(() => resolve(null), expectCode('ATHLETE_SESSION_UNAUTHORIZED'));
  await assert.rejects(
    () => resolve({ ...token, account_id: 6 }),
    expectCode('ATHLETE_SESSION_UNAUTHORIZED'),
  );

  const expired = createResolveAthleteSession({
    repository: baseRepository({
      async findAthleteAccountSession(sessionKey) {
        return sessionRow(sessionKey, { expires_at: new Date(NOW - 1).toISOString() });
      },
    }),
    now: () => NOW,
  });
  await assert.rejects(() => expired(token), expectCode('ATHLETE_SESSION_EXPIRED'));

  const revokedResolve = createResolveAthleteSession({
    repository: baseRepository({
      async findAthleteAccountSession(sessionKey) {
        return sessionRow(sessionKey, { revoked_at: new Date(NOW - 1).toISOString() });
      },
    }),
    now: () => NOW,
  });
  await assert.rejects(() => revokedResolve(token), expectCode('ATHLETE_SESSION_REVOKED'));

  // Hồ sơ luôn đọc theo accountId trong vé, không nhận id từ đầu vào bên ngoài.
  const profile = await createGetAthleteProfile({ repository, now: () => NOW })(token);
  assert.equal(profile.account.login, 'tuan.nguyen');
  assert.equal(profile.club.code, 'PICKHUB7');
  assert.equal(profile.membership.id, 11);
  assert.equal(profile.athlete.status, 'linked');

  const missingProfile = createGetAthleteProfile({
    repository: baseRepository({ async findAthleteAccountProfile() { return null; } }),
    now: () => NOW,
  });
  await assert.rejects(() => missingProfile(token), expectCode('NOT_FOUND'));
}

async function testUpdateContact() {
  const token = verifyAthleteSession(signAthleteSession(baseToken(), SECRET), SECRET, NOW);
  let written = null;
  const update = createUpdateAthleteContact({
    repository: baseRepository({
      async updateAthleteAccountContact(accountId, changes, updatedAt) {
        written = { accountId, changes, updatedAt };
        return {
          email: changes.email ?? null,
          phone: changes.phone ?? null,
          facebookProfileUrl: changes.facebookProfileUrl ?? null,
          contactUpdatedAt: new Date(updatedAt).toISOString(),
          storageReady: true,
        };
      },
    }),
    now: () => NOW,
  });

  const contact = await update(token, {
    email: 'Tuan@Example.com',
    phone: '+84 912 345 678',
    facebookProfileUrl: 'facebook.com/tuan.nguyen',
  });
  assert.equal(written.accountId, 5);
  assert.deepEqual(written.changes, {
    email: 'tuan@example.com',
    phone: '0912345678',
    facebookProfileUrl: 'https://facebook.com/tuan.nguyen',
  });
  assert.equal(contact.facebookProfileUrl, 'https://facebook.com/tuan.nguyen');

  await assert.rejects(
    () => update(token, { facebookProfileUrl: 'https://example.com/me' }),
    expectCode('INVALID_INPUT'),
  );
}

async function testLogout() {
  const repository = baseRepository();
  const logout = createAthleteLogout({ repository, now: () => NOW });
  const token = verifyAthleteSession(signAthleteSession(baseToken(), SECRET), SECRET, NOW);

  assert.deepEqual(await logout(token), { revoked: true });
  assert.equal(repository.revoked.length, 1);
  assert.equal(repository.revoked[0].sessionKey, token.session_key);

  // Không có vé thì vẫn coi như đăng xuất xong, và không gọi DB.
  const empty = baseRepository();
  assert.deepEqual(await createAthleteLogout({ repository: empty, now: () => NOW })(null), { revoked: false });
  assert.equal(empty.revoked.length, 0);
}

function readSource(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function testRouteContracts() {
  const sessions = readSource('app/api/identity/athlete-sessions/route.js');
  assert.ok(/export async function GET\(/.test(sessions), 'route phải có GET đọc phiên hiện tại');
  assert.ok(/export async function POST\(/.test(sessions), 'route phải có POST đăng nhập');
  assert.ok(/export async function DELETE\(/.test(sessions), 'route phải có DELETE đăng xuất');
  assert.ok(/setAthleteSessionCookie\(/.test(sessions), 'đăng nhập phải set cookie');
  assert.ok(/clearGroupSessionCookie\(response\)/.test(sessions), 'đăng nhập VĐV phải xoá phiên CLB dùng chung cũ');
  assert.ok(/clearAthleteSessionCookie\(/.test(sessions), 'đăng xuất phải xoá cookie');
  assert.ok(/consumeRateLimit\(/.test(sessions), 'đăng nhập phải có rate limit chống dò mật khẩu');
  assert.ok(/identityRouteError\(/.test(sessions), 'lỗi phải đi qua identityRouteError');

  const profile = readSource('app/api/identity/athlete-profile/route.js');
  assert.ok(/readSignedAthleteSession\(\)/.test(profile), 'hồ sơ phải lấy phiên từ cookie đã ký');
  // Chốt an toàn: route hồ sơ không được nhận accountId từ query/param.
  assert.ok(!/searchParams/.test(profile), 'route hồ sơ không được nhận id từ query');
  assert.ok(/facebookProfileUrl/.test(profile), 'PATCH hồ sơ phải allowlist facebookProfileUrl');
  assert.ok(/email/.test(profile) && /phone/.test(profile), 'PATCH hồ sơ phải allowlist email và phone');

  const page = readSource('app/ho-so-vdv/page.js');
  assert.ok(/facebookProfileUrl/.test(page), 'UI hồ sơ phải có trường Facebook');
  assert.ok(/BTC giải đấu xác thực VĐV/.test(page), 'UI phải nêu mục đích BTC xác thực VĐV');
  assert.ok(!/profile-footer/.test(page), 'hồ sơ VĐV không được có nút đăng xuất ở profile-footer');

  const rail = readSource('components/pickhub/SideRail.js');
  const athleteLogoutStart = rail.indexOf('async function handleAthleteLogout');
  const athleteLogoutEnd = rail.indexOf('\n    return (', athleteLogoutStart);
  assert.ok(
    athleteLogoutStart >= 0 && athleteLogoutEnd > athleteLogoutStart &&
    /window\.location\.assign\('\/'\)/.test(rail.slice(athleteLogoutStart, athleteLogoutEnd)),
    'đăng xuất VĐV từ menu tài khoản phải trở về trang chủ'
  );

  const migration = readSource('database/migrations/052_athlete_account_facebook_profile.sql');
  assert.ok(/facebook_profile_url/.test(migration), 'migration 052 phải thêm facebook_profile_url');
  assert.ok(/ADD COLUMN IF NOT EXISTS/.test(migration), 'migration 052 phải idempotent');

  const cookie = readSource('lib/athleteSession.js');
  assert.ok(/httpOnly: true/.test(cookie), 'cookie phải httpOnly');
  assert.ok(/sameSite: 'lax'/.test(cookie), "cookie phải sameSite 'lax'");
  assert.ok(/secure: process\.env\.NODE_ENV === 'production'/.test(cookie), 'cookie phải secure ở production');
  assert.ok(/athlete_session/.test(cookie), 'tên cookie phải là athlete_session');
  // Không dùng chung khoá với group_session.
  assert.ok(/DERIVATION_LABEL/.test(cookie), 'khoá phải được dẫn xuất riêng, không dùng thẳng GROUP_SESSION_SECRET');
}

// Thông báo công khai phải nói đúng ngữ cảnh VĐV. Trước đây service ném mã của phiên
// CLB nên người dùng nhập tên đăng nhập lại nhận câu "Mã CLB hoặc mật khẩu không đúng".
function testPublicMessages() {
  const adapter = readSource('lib/application/identity/routeAdapter.js');
  const expected = {
    ATHLETE_CREDENTIALS_INVALID: 'Tên đăng nhập hoặc mật khẩu không đúng.',
    ATHLETE_ACCOUNT_DISABLED: 'Tài khoản đã bị tạm ngưng. Liên hệ quản trị CLB.',
    ATHLETE_SESSION_UNAUTHORIZED: 'Bạn cần đăng nhập bằng tài khoản VĐV.',
    ATHLETE_SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    ATHLETE_SESSION_REVOKED: 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.',
  };
  for (const [code, message] of Object.entries(expected)) {
    assert.ok(adapter.includes(`${code}: '${message}'`), `routeAdapter thiếu thông báo cho ${code}`);
    assert.equal(ERROR_STATUS[code], 401, `${code} phải là 401`);
    // Không được rơi lại vào ngữ cảnh CLB.
    assert.ok(!/Mã CLB|Phiên CLB/.test(message), `${code} không được nhắc tới "Mã CLB"/"Phiên CLB"`);
  }

  // Route GET phải nhận diện nhóm lỗi phiên VĐV bằng isAthleteSessionError. Nếu còn
  // dùng startsWith('SESSION_') thì vé hết hạn sẽ trả 401 đỏ thay vì {account:null}.
  const sessions = readSource('app/api/identity/athlete-sessions/route.js');
  assert.ok(/isAthleteSessionError\(/.test(sessions), 'route GET phải dùng isAthleteSessionError');
  assert.ok(!/startsWith\('SESSION_'\)/.test(sessions), "route không được lọc lỗi bằng startsWith('SESSION_')");
  assert.ok(isAthleteSessionError('ATHLETE_SESSION_EXPIRED'), 'ATHLETE_SESSION_* phải được nhận diện');
  assert.ok(!isAthleteSessionError('SESSION_EXPIRED'), 'lỗi phiên CLB không được lọt vào nhánh VĐV');
  assert.ok(!isAthleteSessionError('ATHLETE_CREDENTIALS_INVALID'), 'lỗi sai mật khẩu không phải lỗi phiên');
}

// Vé VĐV mở quyền ĐỌC dữ liệu CLB, và chỉ quyền đọc.
function testAthleteReadAccess() {
  // Quyền: 'athlete' xem được CLB nhưng không có cờ quản lý nào.
  const athleteView = buildClubSessionView({ group_id: 7, role: 'athlete', signed: true });
  assert.equal(athleteView.permissions.canViewClub, true, 'VĐV phải xem được dữ liệu CLB');
  for (const flag of ['canManageFund', 'canManageRoster', 'canManagePhr', 'canManageSettings']) {
    assert.equal(athleteView.permissions[flag], false, `VĐV không được có quyền ${flag}`);
  }
  // Khách vãng lai (default context) vẫn không xem được.
  assert.equal(
    buildClubSessionView({ group_id: 1, role: 'member', signed: false }).permissions.canViewClub,
    false,
    'default context chưa ký không được coi là có quyền xem',
  );
  assert.equal(buildClubSessionView(null).permissions.canViewClub, false, 'không có phiên thì không xem được');

  // Các route đọc phải lấy scope qua clubReadContext, không còn đọc thẳng cookie CLB.
  const readRoutes = [
    ['app/api/identity/roster/route.js', /requireClubReadSession\(\)/],
    ['app/api/identity/assessments/route.js', /requireClubReadSession\(\)/],
    ['app/api/groups/session/route.js', /getClubReadContext\(\)/],
    ['app/api/club/branding/route.js', /await getClubReadContext\(\)/],
    // Dữ liệu riêng của CLB: requireClubReadScope vẫn nhận vé VĐV như trước,
    // nhưng không còn rơi về CLB mặc định khi người gọi ẩn danh (xem
    // tests/phase1/club-read-scope.test.js).
    ['app/api/club/transactions/route.js', /await requireClubReadScope\(\)/],
    ['app/api/club/members/route.js', /await requireClubReadScope\(\)/],
    ['app/api/club/events/route.js', /await requireClubReadScope\(\)/],
    ['app/api/club/bxh/share-image/route.js', /await requireClubReadScope\(\)/],
  ];
  for (const [file, pattern] of readRoutes) {
    assert.ok(pattern.test(readSource(file)), `${file} phải lấy scope đọc qua clubReadContext`);
  }

  // Route GHI không được đổi: vẫn phải qua guard admin của phiên CLB.
  for (const file of ['app/api/club/transactions/route.js', 'app/api/club/members/route.js', 'app/api/club/events/route.js']) {
    assert.ok(/requireValidatedGroupAdmin\(\)/.test(readSource(file)), `${file} phải giữ guard admin cho route ghi`);
  }

  // Bẫy đã mắc một lần: getClubReadContext fallback về default context (role 'member',
  // signed:false), dùng nó để gác trang nội bộ sẽ cho khách vãng lai lọt vào.
  const dashboard = readSource('app/giai-dau/v2/page.js');
  assert.ok(/getAthleteClubContext\(\)/.test(dashboard), 'dashboard phải gác bằng getAthleteClubContext');
  assert.ok(!/getClubReadContext\(/.test(dashboard), 'dashboard không được gác bằng getClubReadContext');

  // Vé VĐV không bao giờ được cấp role member/admin.
  const context = readSource('lib/clubReadContext.js');
  assert.ok(/role: ATHLETE_READ_ROLE/.test(context), 'ngữ cảnh VĐV phải mang role riêng');
  assert.ok(/ATHLETE_READ_ROLE = 'athlete'/.test(context), "role đọc của VĐV phải là 'athlete'");
  assert.ok(/resolveAthleteSession\(/.test(context), 'ngữ cảnh VĐV phải đối chiếu vé với DB');
  // group_id phải suy ra từ vé, không nhận từ client.
  assert.ok(/group_id: club\.id/.test(context), 'group_id phải lấy từ CLB trong vé');
  assert.ok(!/searchParams|request\./.test(context), 'clubReadContext không được đọc tham số từ request');
  assert.ok(context.indexOf('const athleteContext = await getAthleteClubContext();') < context.indexOf('const clubSession = getGroupSessionFromCookies();'), 'athlete_session phải được ưu tiên hơn group_session khi đọc dữ liệu CLB');
}

function testAthleteSingleSessionUi() {
  const info = readSource('app/thong-tin/page.js');
  assert.ok(/fetch\('\/api\/identity\/athlete-sessions'/.test(info), 'Thông tin phải đọc athlete_session');
  assert.ok(/router\.replace\(`\/thanh-vien\/\$\{encodeURIComponent\(membershipId\)\}`\)/.test(info), 'Thông tin phải chuyển về đúng membership trong phiên VĐV');
  assert.ok(!/showLinkCta/.test(info), 'Thông tin không được hiện CTA xác thực/liên kết');

  const profilePage = readSource('app/thanh-vien/[membershipId]/page.js');
  assert.ok(/setShowLinkCta\(!athleteAccount/.test(profilePage), 'đã có athlete_session thì phải ẩn CTA xác thực');
  assert.ok(/self: isOwnProfile/.test(profilePage), 'hồ sơ đúng membership trong athlete_session phải được đánh dấu chính chủ');

  const profile = readSource('components/pickhub/MemberProfileView.js');
  assert.ok(/showLinkCta && !isSelf/.test(profile), 'CTA xác thực không được hiện cho hồ sơ chính chủ');

  const rail = readSource('components/pickhub/SideRail.js');
  assert.ok(/!hasAthlete && canLogout/.test(rail), 'menu VĐV không được hiện thêm đăng xuất phiên CLB');

  const home = readSource('app/page.js');
  assert.ok(/fetch\('\/api\/identity\/athlete-sessions'/.test(home), 'trang chủ phải đọc athlete_session');
  assert.ok(/setActiveModal\('athlete-login'\)/.test(home), 'trang chủ phải mở được modal đăng nhập VĐV');
  assert.ok(/handleAthleteLogin/.test(home), 'trang chủ phải có handler đăng nhập VĐV');
  assert.ok(/Hồ sơ VĐV &amp; đăng ký giải/.test(home), 'trang chủ phải có khối Hồ sơ VĐV & đăng ký giải');
  assert.ok(/Truy cập CLB/.test(home), 'trang chủ phải có khối Truy cập CLB');
  assert.ok(/Khám phá giải đấu Pickleball/.test(home), 'trang chủ phải có mục khám phá giải đấu');
  const athleteBlockStart = home.indexOf('id="ph-land-athlete"');
  const athleteBlockEnd = home.indexOf('ph-land__features', athleteBlockStart);
  assert.ok(
    athleteBlockStart >= 0 &&
      athleteBlockEnd > athleteBlockStart &&
      /href="\/dk"/.test(home.slice(athleteBlockStart, athleteBlockEnd)),
    'mục khám phá giải phải nằm trong khối Hồ sơ VĐV & đăng ký giải'
  );
  assert.ok(/href="\/dang-ky"/.test(home), 'trang chủ phải dẫn đăng ký VĐV tới /dang-ky');
  assert.ok(/href="\/ho-so-vdv"/.test(home), 'đã đăng nhập thì trang chủ phải dẫn tới hồ sơ VĐV');
  assert.ok(/window\.location\.assign\('\/ho-so-vdv'\)/.test(home), 'đăng nhập VĐV từ trang chủ phải vào hồ sơ');
}


async function main() {
  testSignAndVerify();
  testSessionState();
  testLoginInputValidation();
  await testLoginHappyPath();
  await testLoginFailures();
  await testResolveAndProfile();
  await testUpdateContact();
  await testLogout();
  testRouteContracts();
  testPublicMessages();
  testAthleteReadAccess();
  testAthleteSingleSessionUi();
  console.log('athlete-sessions: all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
