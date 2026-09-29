# Epic 4 · Lát C1 — Danh tính VĐV công khai: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (làm inline). Steps dùng checkbox `- [ ]`.

**Goal:** Người chơi ngoài CLB tự tạo/đăng nhập tài khoản VĐV (SĐT + mật khẩu), admin hệ thống có trang đăng nhập, và có bộ đếm giới hạn tần suất lưu DB.

**Architecture:** Domain thuần CommonJS (`lib/domain/identity/`), lớp Next mỏng (`lib/playerSession.js`, `lib/publicRateLimit.js`), route `app/api/player/*`, trang `app/cong-dong/*`. Migration 112 additive (3 bảng + RPC). Spec chi tiết: `docs/superpowers/specs/2026-09-29-epic-4-community/lat-c1-danh-tinh.md` (nguồn sự thật cho shape, mã lỗi, hạn mức).

**Tech Stack:** Next.js 14 App Router (JS), Supabase service role, node test thuần (`tests/stitch-setup/epic-4/`, harness `tests/stitch-setup/_harness.js`).

**Quy ước áp dụng:** mọi test dưới `tests/stitch-setup/epic-4/*.test.js` tự chạy bởi `npm run test:stitch-setup`. Băm mật khẩu dùng `lib/domain/identity/password.js` (pbkdf2, `hashPassword/verifyPassword`) — không tự viết mới. Chuẩn hóa SĐT dùng `normalizePhone` của `lib/tournament/openRegistration.js`. Không sửa test cũ. Không chạm `lib/athleteSession.js`, `lib/groupSession*.js`.

---

## Bản đồ file

| File | Việc |
|---|---|
| `lib/domain/identity/playerAccount.js` (mới) | `parseRegisterInput`, `parseLoginInput`, `parseProfilePatch`, `projectPlayerAccount`, mã lỗi |
| `lib/domain/identity/playerSession.js` (mới) | ký/xác minh vé, `getPlayerSessionState`, hạn 30 ngày |
| `lib/domain/identity/playerRateLimits.js` (mới) | bảng hạn mức + hàm dựng bucket (thuần) |
| `lib/playerSession.js` (mới, Next) | cookie `player_session`, `requirePlayerSession` |
| `lib/publicRateLimit.js` (mới, Next) | gọi RPC `consume_rate_limit` |
| `lib/tournament/communityMessages.js` (mới, thuần) | thông điệp tiếng Việt cho mã lỗi |
| `app/api/player/accounts/route.js` (mới) | POST tạo tài khoản |
| `app/api/player/session/route.js` (mới) | POST đăng nhập · GET phiên · DELETE đăng xuất |
| `app/api/player/profile/route.js` (mới) | GET · PATCH (hồ sơ, đổi mật khẩu) |
| `app/api/platform/session/route.js` (sửa nhỏ) | thêm bộ đếm DB trước bộ đếm bộ nhớ |
| `app/cong-dong/layout.js`, `community.css` (mới) | khung nhẹ, không AppShell CLB |
| `app/cong-dong/tai-khoan/page.js` + `AccountClient.js` (mới) | Tạo tài khoản / Đăng nhập (2 tab) |
| `app/cong-dong/tai-khoan/ho-so/page.js` + `ProfileClient.js` (mới) | hồ sơ, đổi mật khẩu, đăng xuất |
| `app/cong-dong/quan-tri/page.js` + `PlatformLoginClient.js` (mới) | đăng nhập admin hệ thống |
| `database/migrations/112_player_accounts.sql` (mới) | §Migration |
| `database/tests/epic4_c1_integration.sql` (mới) | SQL tích hợp ROLLBACK |
| `tests/stitch-setup/epic-4/c1-*.test.js` (mới) | 5 file test |
| `scripts/seed-platform-account.js` (sửa nhỏ) | README dùng + kiểm đầu vào (không đổi hành vi) |

---

## Task 1: Domain tài khoản (`playerAccount.js`)

**Files:** Create `lib/domain/identity/playerAccount.js` · Test `tests/stitch-setup/epic-4/c1-account-domain.test.js`

- [ ] **Step 1: Viết test đỏ** — `c1-account-domain.test.js` dùng `suite(...)` của harness, các ca:
  - `parseRegisterInput` chấp nhận `{ phone:'+84 912 345 678', password:'matkhau123', displayName:' Nguyễn Minh ' }` → `ok:true`, `value.phoneNorm==='0912345678'`, `displayName==='Nguyễn Minh'`.
  - Từ chối: SĐT `'123'` → `PLAYER_PHONE_INVALID`; mật khẩu 7 ký tự → `PLAYER_PASSWORD_WEAK`; mật khẩu > 128 → `PLAYER_PASSWORD_WEAK`; tên rỗng/toàn khoảng trắng/> 60 ký tự → `PLAYER_NAME_INVALID`; honeypot `company:'x'` → `PLAYER_HONEYPOT`; `gender:'x'` → `PLAYER_PROFILE_INVALID`; `selfDeclaredPhr:-1` → `PLAYER_PROFILE_INVALID`; `dob:'2999-01-01'` (tương lai) → `PLAYER_PROFILE_INVALID`.
  - Trường tùy chọn rỗng (`gender:''`, `dob:''`, `selfDeclaredPhr:''`) → `null`.
  - `parseLoginInput`: thiếu SĐT hoặc mật khẩu, SĐT sai định dạng, mật khẩu > 128 → **cùng** một mã `PLAYER_LOGIN_FAILED` (không lộ lý do).
  - `parseProfilePatch({ displayName, gender, dob, selfDeclaredPhr })` chỉ trả trường có mặt; `currentPassword`+`newPassword` phải đi cặp, mật khẩu mới ≥ 8.
  - `projectPlayerAccount(row)` chỉ trả đúng 5 khóa `id, displayName, gender, dob, selfDeclaredPhr`; đưa row có `password_hash`, `phone_norm`, `athlete_id`, `access_version` → **không** có các khóa đó.
- [ ] **Step 2:** Chạy `node tests/stitch-setup/epic-4/c1-account-domain.test.js` → đỏ (module chưa có).
- [ ] **Step 3: Cài `playerAccount.js`** — hằng `PASSWORD_MIN=8`, `PASSWORD_MAX=128`, `NAME_MAX=60`; `PLAYER_ERRORS` đóng băng; các hàm trên; dùng `normalizePhone` (bắt `OpenRegError` → `PLAYER_PHONE_INVALID`). Trả `{ ok:true, value }` hoặc `{ ok:false, code }`.
- [ ] **Step 4:** Chạy lại test → xanh.
- [ ] **Step 5: Commit** `feat(cong-dong): domain tai khoan VDV (C1)`.

## Task 2: Domain phiên (`playerSession.js`)

**Files:** Create `lib/domain/identity/playerSession.js` · Test `tests/stitch-setup/epic-4/c1-session.test.js`

- [ ] **Step 1: Test đỏ** — các ca: ký rồi xác minh cùng secret → payload đúng `account_id`; secret khác → `null`; sửa 1 ký tự payload → `null`; vé hết hạn (`now` > `expires_at`) → `null`; **vé athlete/group/platform ký cùng secret bị từ chối** (dựng bằng `signAthleteSession`, `signPlatformSession` rồi `verifyPlayerSession` → `null`); nhãn khóa dẫn xuất khác nhau (`playerSessionSecret` khác `athleteSessionSecret` cho cùng `GROUP_SESSION_SECRET`); `getPlayerSessionState`: `active`, `revoked` (`revoked_at`), `revoked` (account `disabled`), `revoked` (`access_version` lệch), `expired`, `invalid` (thiếu bản ghi).
- [ ] **Step 2:** Chạy → đỏ.
- [ ] **Step 3: Cài** — mẫu `lib/domain/identity/athleteSession.js` nhưng payload `{ account_id, session_key, issued_at, expires_at, session_version:1, access_version, kind:'player' }`; **bắt buộc** `kind==='player'` khi xác minh (chống dùng chéo vé); hàm `derivePlayerSessionSecret(base)` = `HMAC-SHA256(base, 'pickhub:player-session:v1')` base64url; xuất `generatePlayerSessionKey`, `hashPlayerSessionKey` (sha256 hex).
- [ ] **Step 4:** Chạy → xanh.
- [ ] **Step 5: Commit** `feat(cong-dong): domain phien VDV (C1)`.

## Task 3: Hạn mức tần suất (`playerRateLimits.js`) + thông điệp

**Files:** Create `lib/domain/identity/playerRateLimits.js`, `lib/tournament/communityMessages.js` · Test `tests/stitch-setup/epic-4/c1-rate-limits.test.js`

- [ ] **Step 1: Test đỏ** — `RATE_POLICIES` đúng bảng spec §4: `register_ip {limit:5, windowSeconds:3600}`, `register_phone {3, 3600}`, `login {8, 300}`, `session_read_ip {30, 60}`, `profile {20, 60}`, `platform_login {8, 300}`; `bucketFor('login', { phoneNorm:'0912345678', ip:'1.2.3.4' })` → chuỗi ổn định `player:login:0912345678:1.2.3.4`; IP/SĐT dài bị cắt ≤ 300 ký tự; khóa lạ ném lỗi; mọi mã trong `PLAYER_ERRORS` đều có thông điệp tiếng Việt không rỗng trong `communityMessages.messageFor(code)`; mã lạ → thông điệp chung.
- [ ] **Step 2:** Chạy → đỏ. **Step 3: Cài.** **Step 4:** xanh.
- [ ] **Step 5: Commit** `feat(cong-dong): han muc tan suat + thong diep (C1)`.

## Task 4: Migration 112 + SQL tích hợp

**Files:** Create `database/migrations/112_player_accounts.sql`, `database/tests/epic4_c1_integration.sql` · Test `tests/stitch-setup/epic-4/c1-migration-static.test.js`

- [ ] **Step 1: Test tĩnh đỏ** — đọc 112: có `BEGIN;`/`COMMIT;`; có `CREATE TABLE IF NOT EXISTS public.player_accounts|player_sessions|public_rate_limits`; `phone_norm text NOT NULL UNIQUE`; CHECK `status IN ('active','disabled')`, `gender IN ('male','female')`; `ENABLE ROW LEVEL SECURITY` cho cả 3 bảng và **không** `CREATE POLICY`; hàm `consume_rate_limit` có `SECURITY DEFINER SET search_path = public` + `REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE … TO service_role`; **không** có `DROP`, `TRUNCATE`, `DELETE FROM`; không `ALTER TABLE` bảng có sẵn; có `COMMENT ON TABLE` cho 3 bảng.
- [ ] **Step 2:** Chạy → đỏ (chưa có file).
- [ ] **Step 3: Viết migration** theo spec §2. `consume_rate_limit(p_bucket text, p_limit int, p_window_seconds int) returns table(allowed boolean, retry_after int)`: một câu `INSERT … ON CONFLICT (bucket) DO UPDATE SET count = CASE WHEN public_rate_limits.reset_at <= now() THEN 1 ELSE public_rate_limits.count + 1 END, reset_at = CASE WHEN public_rate_limits.reset_at <= now() THEN now() + make_interval(secs => p_window_seconds) ELSE public_rate_limits.reset_at END RETURNING count, reset_at`, rồi `allowed := count <= p_limit`, `retry_after := ceil(extract(epoch from reset_at - now()))` (0 khi cho phép). Kiểm tham số: `p_limit BETWEEN 1 AND 1000`, `p_window_seconds BETWEEN 1 AND 86400`, `p_bucket` 1–300 ký tự, ngược lại `RAISE EXCEPTION`.
- [ ] **Step 4:** Test tĩnh xanh.
- [ ] **Step 5: SQL tích hợp** (`epic4_c1_integration.sql`, mẫu `epic3_f1_integration.sql`: `BEGIN; <nạp 112>; ca…; ROLLBACK`): (a) `consume_rate_limit('t',3,60)` gọi 4 lần → 3 lần `allowed`, lần 4 `allowed=false` và `retry_after>0`; (b) bucket khác không ảnh hưởng; (c) hai `player_accounts` cùng `phone_norm` → `unique_violation`; (d) `gender='x'` → `check_violation`; (e) `player_sessions` trùng `(account_id, session_key_hash)` → `unique_violation`; (f) `p_limit=0` → lỗi tham số.
- [ ] **Step 6:** Chạy ROLLBACK qua Supabase MCP `execute_sql` (dán nguyên văn) → bảng kết quả `zz.ALL = ok`.
- [ ] **Step 7: Apply** bằng `apply_migration` (tên `player_accounts`); kiểm `md5(prosrc)` của `consume_rate_limit` khớp thân hàm trong file; `npm run migration:ledger` không báo lệch.
- [ ] **Step 8: Commit** `feat(cong-dong): migration 112 tai khoan VDV + bo dem han muc`.

## Task 5: Lớp Next (`playerSession.js`, `publicRateLimit.js`)

**Files:** Create `lib/playerSession.js`, `lib/publicRateLimit.js` · Test `tests/stitch-setup/epic-4/c1-route-contract.test.js` (phần 1)

- [ ] **Step 1: Test đỏ (đọc mã nguồn)** — `lib/playerSession.js` xuất `PLAYER_SESSION_COOKIE === 'player_session'`, `setPlayerSessionCookie` (httpOnly, sameSite lax, secure prod, path `/`, maxAge), `clearPlayerSessionCookie`, `requirePlayerSession`; **không** import `athleteSession`/`groupSession`/`platformSession`; `requirePlayerSession` đối chiếu `player_sessions` **và** `player_accounts` (`access_version`, `status`, `revoked_at`) qua `getPlayerSessionState`. `lib/publicRateLimit.js` gọi `rpc('consume_rate_limit'`; lỗi RPC → **fail-closed** cho login/register (trả `allowed:false`) — ghi rõ trong code.
- [ ] **Step 2–4:** đỏ → cài (`readSignedPlayerSession` giống `lib/athleteSession.js`; `requirePlayerSession` trả `{ ok:true, account }` hoặc `{ ok:false, response: 401 }`) → xanh.
- [ ] **Step 5: Commit** `feat(cong-dong): lop Next cho phien VDV (C1)`.

## Task 6: Routes `app/api/player/*`

**Files:** Create 3 route · Test mở rộng `c1-route-contract.test.js` + `c1-permission-matrix.test.js`

- [ ] **Step 1: Test đỏ** — contract (đọc mã): mỗi route `export const dynamic = 'force-dynamic'`; POST accounts kiểm honeypot, gọi `consume_rate_limit` với `register_ip` **và** `register_phone` trước khi băm mật khẩu, xử lý `unique_violation` → 409 `PLAYER_PHONE_TAKEN`, trả 201 + `Set-Cookie` + `{ account }` chỉ qua `projectPlayerAccount`; POST session sai mật khẩu **và** SĐT không tồn tại đều 401 `PLAYER_LOGIN_FAILED` (có gọi `verifyPassword` với hash giả để cân thời gian khi không có tài khoản); DELETE thu hồi bản ghi phiên (`revoked_at`) và xóa cookie; profile PATCH đổi mật khẩu cần `currentPassword` đúng và tăng `access_version` + thu hồi phiên khác; mọi phản hồi `Cache-Control: no-store`; không route nào chứa `password_hash`/`phone_norm` trong JSON trả về (quét chuỗi trong lệnh `NextResponse.json`). Ma trận quyền (đọc mã): các route admin `setup`, `registrations`, `tournaments` **không** import `playerSession`; `app/api/player/*` không import `groupSession`/`platformSession`.
- [ ] **Step 2–4:** đỏ → cài routes theo spec §4 → xanh. `platform/session/route.js`: gọi `consumePublicRateLimit('platform_login', …)` trước `limiter.canAttempt` (giữ nguyên phần còn lại).
- [ ] **Step 5: Commit** `feat(cong-dong): API tai khoan/phien/ho so VDV (C1)`.

## Task 7: Trang `/cong-dong/*`

**Files:** Create các trang ở bản đồ file · Test `tests/stitch-setup/epic-4/c1-ui-contract.test.js`

- [ ] **Step 1: Test đỏ (đọc mã)** — tab `Tạo tài khoản`/`Đăng nhập`; nhãn tiếng Việt đúng (`Tên hiển thị`, `Số điện thoại`, `Mật khẩu`, `Nhập lại mật khẩu`, `Tạo tài khoản`, `Đăng nhập`); ô honeypot ẩn (`name="company"`, `tabIndex={-1}`, `aria-hidden`); `?next=` chỉ chấp nhận đường dẫn bắt đầu `/cong-dong/` (hàm `safeNext` thuần, có test biên: `//evil.com`, `https://x`, `/\\x`, `/giai-dau`); trang admin **không** có nút đăng ký; mọi fetch qua `/api/player/*` hoặc `/api/platform/session`, không import Supabase; CSS có breakpoint mobile 390 và thẻ giữa `max-width: 440px`.
- [ ] **Step 2–4:** đỏ → cài (mobile-first, thẻ căn giữa 440px, lỗi theo `communityMessages`, trạng thái 429 hiện "thử lại sau N giây") → xanh.
- [ ] **Step 5: Commit** `feat(cong-dong): trang tai khoan VDV + dang nhap admin he thong (C1)`.

## Task 8: Kiểm chứng tổng và bằng chứng

- [ ] `npm run test:stitch-setup` xanh toàn bộ (kể cả lat-0/a/b/c, epic-1..3).
- [ ] `npm run build` không lỗi (nếu build quá lâu: `npx next lint` + chạy dev server).
- [ ] Dev server (`preview_start`): 390px và 1280px — tạo tài khoản, đăng xuất, đăng nhập sai (thông điệp đồng nhất), đăng nhập đúng, đăng ký 6 lần liên tiếp → lần 6 báo giới hạn; ảnh chụp.
- [ ] Dọn dữ liệu test: chỉ `player_accounts` có `display_name` tiền tố `TEST-CD`, cùng phiên/bucket của chúng (sau khi người dùng đồng ý).
- [ ] Ghi `_workspace/epic-4-community/evidence.md` (lát C1), commit, push nhánh.

## Tự rà soát với spec

| Yêu cầu spec C1 | Task |
|---|---|
| §2 bảng + RPC + RLS | 4 |
| §3 domain (account, session, rate) | 1, 2, 3 |
| §4 API + hạn mức | 3, 6 |
| §5 giao diện | 7 |
| §6 cấp admin (script sẵn) | 6 (sửa nhỏ script + hướng dẫn), 8 (người dùng chạy) |
| §7 test | 1–7 |
| §8 nghiệm thu | 8 |
