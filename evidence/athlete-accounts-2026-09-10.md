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
