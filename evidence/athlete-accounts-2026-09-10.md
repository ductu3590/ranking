# Đăng ký tài khoản VĐV liên kết membership — hoàn thiện & kiểm chứng (2026-09-10)

## Phạm vi

Hoàn thiện flow đăng ký tài khoản liên kết với athlete/membership sẵn có trong CLB:
trang `/dang-ky`, API `/api/identity/athlete-accounts`, service + repository, và kiểm
chứng bằng test tích hợp chạy thật trên Supabase.

## Model dữ liệu

Bảng `athlete_accounts` (migration `048_athlete_accounts.sql`) là nơi lưu mapping
account ↔ athlete/membership:

- `club_id` → `groups(id)`: scope multi-tenant, mọi truy vấn đều lọc theo cột này.
- `athlete_id` → `athletes(id)`, `membership_id` → `club_memberships(id)`: hồ sơ được nhận.
- `login` + `password_hash`: đăng nhập riêng của VĐV (không dùng Supabase Auth, hash
  bằng scrypt như `platform_accounts`).
- Unique index trên `lower(login)` và trên `athlete_id` → mỗi hồ sơ chỉ gắn 1 tài khoản.
- RLS bật, không policy → chỉ service-role qua API route truy cập được.

Đăng ký thành công cũng chuyển `athletes.status` từ `unclaimed` sang `linked`.

## Hai lỗi thật đã sửa

1. `lib/repositories/identity/compatibilityRepository.js` —
   `findAthleteAccountByLogin` dùng `ilike`, nên `_` và `%` trong login bị hiểu là
   wildcard. Hệ quả: login `ab_c123` bị báo "đã tồn tại" oan vì khớp với `abxc123`
   đã có. Đổi sang so sánh không phân biệt hoa/thường trên giá trị nguyên văn.
2. `lib/application/identity/athleteAccounts.js` — khi hai request đăng ký cùng login
   chạy song song, bước đọc kiểm tra trùng không chặn được; unique index ở DB mới
   chặn, và lỗi Postgres `23505` rơi ra ngoài thành 500. Nay map về
   `VERSION_CONFLICT` (409) với thông báo tiếng Việt.

## Test

- `tests/athlete-accounts.test.js` (unit, fake repository) — `npm run test:athlete-accounts`.
- `tests/athlete-accounts/live.integration.test.js` (mới, chạy thật qua PostgREST) —
  `npm run test:athlete-accounts-live`. 53 checks, gồm: danh sách claimable lọc đúng
  active/unclaimed, happy path, hash mật khẩu (verify đúng/sai, không lưu plaintext),
  `athletes.status` → `linked`, regression bug `ilike`, trùng login, hồ sơ đã có tài
  khoản, membership CLB khác (cả hai chiều), membership đã rời CLB, 6 case input sai,
  4 case session (thiếu/chưa ký/hết hạn/`access_version` lệch), và race unique violation.
- `npm run test:regression` nay gọi `test:athlete-accounts`.

### Kết quả chạy

```
athlete-accounts: all checks passed
cleanup trước khi chạy: athlete_accounts=0 club_memberships=0
athlete-accounts live: all 53 checks passed
cleanup sau khi chạy: athlete_accounts=2 club_memberships=6 athletes=6
global navigation contract ok
mobile bottom tabs contract ok
npm run build → thành công, route /dang-ky có trong output (2.24 kB / 96 kB)
```

## Đóng vòng: đăng nhập & hồ sơ của chính mình

Đăng ký xong mà không đăng nhập được thì tài khoản chưa có giá trị, nên phần này bổ
sung nốt vòng: `/dang-ky` → `/dang-nhap-vdv` → `/ho-so-vdv` → đăng xuất.

### Vé phiên riêng, không dùng chung với `group_session`

- `athlete_account_sessions` (cùng migration `048_athlete_accounts.sql`) lưu **hash**
  khoá phiên (SHA-256), không lưu khoá thô; có `revoked_at` để đăng xuất từng thiết bị.
  RLS bật, không policy.
- Cookie `athlete_session` (httpOnly, sameSite lax, secure ở production), ký HMAC riêng.
  Khoá lấy từ `ATHLETE_SESSION_SECRET`, nếu chưa đặt thì **dẫn xuất** từ
  `GROUP_SESSION_SECRET` qua HMAC với nhãn `pickhub:athlete-session:v1` — không phải
  thêm biến môi trường khi deploy, mà hai hệ vé vẫn không dùng chung khoá.
- Cookie không phải nguồn sự thật: mỗi request đối chiếu lại bản ghi phiên + trạng thái
  tài khoản trong DB. Tài khoản bị `disabled`, `access_version` tăng, hồ sơ bị chuyển
  CLB khác, hoặc phiên bị thu hồi → vé cũ chết ngay.
- Sai login và sai mật khẩu trả **cùng một** mã lỗi/thông báo, không tiết lộ login nào
  tồn tại. Đăng nhập giới hạn 8 lần / 5 phút theo IP + login (siết hơn mức 20/phút của
  mutation thường vì đây là điểm dò mật khẩu).
- `/api/identity/athlete-profile` lấy `accountId` từ vé đã ký, không nhận id từ query,
  nên không thể đọc hồ sơ tài khoản khác.

### Test

- `tests/athlete-sessions.test.js` (unit) — `npm run test:athlete-sessions`: ký/verify vé
  (sai khoá, sửa payload, thiếu chữ ký, hết hạn, chưa hiệu lực, lệch `access_version`),
  8 nhánh của `getAthleteSessionState`, login/logout/profile với repository giả.
- `tests/athlete-accounts/login.live.integration.test.js` (chạy thật) —
  `npm run test:athlete-sessions-live`: **65 checks**, gồm đăng ký → đăng nhập → hồ sơ →
  đăng xuất; DB chỉ lưu hash khoá phiên; login chữ HOA vẫn vào được; regression `_`/`%`
  không thành wildcard khi tra login; vé tự ký cho tài khoản khác bị chặn; tài khoản
  `disabled`; `access_version` tăng; đăng xuất thu hồi đúng một phiên (phiên khác còn
  sống); phiên hết hạn trong DB.
- `test:identity` và `test:regression` nay gọi cả `test:athlete-sessions`.

```
athlete-sessions: all checks passed
cleanup trước khi chạy: athlete_accounts=0 club_memberships=0
athlete-login live: all 65 checks passed
cleanup sau khi chạy: athlete_account_sessions=6 athlete_accounts=1 club_memberships=2 athletes=2
npm run build → thành công; có /dang-nhap-vdv (1.33 kB / 95.1 kB) và /ho-so-vdv (1.53 kB / 95.3 kB)
```

## An toàn dữ liệu

Test live chỉ ghi vào 2 CLB test cố định `AATESTA0` / `AATESTB0`; kiểm tra code CLB
trước khi ghi, không khớp thì SKIP. Thiếu `SUPABASE_SERVICE_ROLE_KEY` cũng SKIP nên
CI không vỡ. Dọn dữ liệu trước và sau mỗi lần chạy, scope theo `club_id`, không dùng
`DROP`/`TRUNCATE`.

Test seed athlete trực tiếp vào `athletes` + `club_memberships`, **không** qua
`club_members`: bảng đó có trigger `club_members_soft_delete` (BEFORE DELETE, `RETURN
NULL`) nên bản ghi chỉ soft-delete và rác test sẽ không xoá được.

## Còn tồn đọng (ngoài phạm vi task này)

- `npm run test:identity` fail ở `tests/phase2/validated-mutation-guard.test.js`:
  `app/api/tournament-v2/stages/route.js` đã được chuyển sang `requireTournamentAccess`
  trong working tree (thay đổi chưa commit của công việc module giải đấu), nhưng test
  vẫn đòi `await requireValidatedGroupAdmin()`. Lỗi có sẵn từ trước, không liên quan
  athlete accounts — vì vậy `test:regression` gọi `test:athlete-accounts` thay vì cả
  `test:identity`. Cần chủ nhân thay đổi tournament cập nhật lại contract test.
- Hai group test cũ `AATESTX2` / `AATESTX3` (id 15, 16) không xoá được do FK
  `club_members_group_id_fkey` + trigger soft-delete. Đã dọn sạch bảng con, đổi tên
  đánh dấu không dùng. Muốn xoá hẳn cần chạy SQL trực tiếp (tạm vô hiệu trigger).
