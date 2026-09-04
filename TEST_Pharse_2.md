# TEST_Pharse_2 — Identity, Athlete/Membership và Club Access

Tài liệu nghiệm thu Phase 2 trước merge/deploy. Không chạy migration hoặc mutation trên production khi chưa backup và phê duyệt.

## Trước khi test

```powershell
git status --short --branch
git log --oneline -5
git diff --check
npm ci
```

Tạo `.env.test.local` (không commit) trỏ tới Supabase staging:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>
GROUP_SESSION_SECRET=<random-long-secret>
```

Snapshot staging. **Project rỗng không thể chạy trực tiếp `001`**: các migration đầu tiên giả định schema legacy (đặc biệt `quy_pickleball`) đã được tạo trước đó, nhưng schema nền này không nằm trong thư mục migration hiện tại. Trước tiên phải import baseline schema/data từ project cũ hoặc tạo một baseline đã được kiểm chứng. Sau khi baseline tồn tại, chạy **toàn bộ migration `001` đến `029`** theo thứ tự tên file; không được chạy riêng `028`/`029` vì chúng phụ thuộc schema của các migration trước. Lưu ý có hai file bắt đầu bằng `011`, cần chạy cả hai trước `012`. Nếu database đã được xác nhận ở `027`, chỉ khi đó mới chạy `028_phase2_athlete_identity.sql` rồi `029_phase2_athlete_link_reviews.sql`. Ghi count `club_members` trước/sau và mapping legacy. Không khóa ghi `club_members` trước khi consumer cũ chuyển xong.

## Test tự động

Chạy theo thứ tự, dừng khi có lỗi:

```powershell
npm run test:identity
npm run test:regression
npm run test:ui-phase2
npm run test:isolation
npm run test:leaderboard
npm run test:teamfund
npm test
npm run build
git diff --check
```

Tất cả phải trả exit code `0`; `test:isolation` bắt buộc dùng credentials staging thật.

## Database/RLS và isolation

- Mỗi `club_member` có đúng một mapping bất biến tới athlete/membership; không merge theo tên.
- Count legacy không đổi; fund/tournament truy nguyên được `athlete_id`/`membership_id`.
- Tạo Club A/B. Session A chỉ GET/ghi được dữ liệu A; truy cập resource B trả `403`/`404`.
- Không đổi được `group_id` bằng body, query hoặc localStorage.
- Projection không lộ password hash, session token, contact/private fields.
- Membership kết thúc vẫn giữ lịch sử và PHR append-only.

## Session và quyền

1. Join đúng/sai bằng mã CLB + mật khẩu; kiểm tra stable error và cookie HTTP-only.
2. Member đọc roster/quỹ/BXH/giải/Thông tin được; mọi mutation trả `403 forbidden`.
3. Admin chỉ mutation trong đúng `group_id`: roster, alias, PHR, end membership.
4. Rotate password/regenerate code tăng `groups.access_version` atomically; session cũ bị từ chối ở request kế tiếp.
5. Logout/revoke chặn session ngay; session mới hoạt động.
6. Server xác thực issued/expiry, session id, role và access version; không tin localStorage.

## UI thủ công (390px và 1440px)

1. Vào `/quy`, đăng nhập Club A; xác nhận tab `Quỹ | Thành viên | BXH | Giải | Thông tin`.
2. Dùng ClubSwitcher nhập Club B; xác nhận dữ liệu không lẫn giữa hai CLB.
3. Roster hiển thị athlete, nickname, active/inactive và unclaimed.
4. `Thông tin` hiển thị athlete/membership, PHR history, related clubs; không có private fields.
5. Member không thấy control ghi/cấu hình và URL mutation vẫn bị từ chối.
6. Leader/admin thấy roster, quỹ, PHR và `Cấu hình` actions.
7. Tạo athlete unclaimed, đổi nickname, thêm PHR, kết thúc membership; refresh kiểm tra lịch sử còn nguyên.

## Sau khi test

```powershell
git status --short
git diff --check
```

- Ghi exit code, commit SHA, migration checksum, timestamp và failure reproduction vào `docs/pickhub-core/evidence/phase-2-test-report.md`.
- Xóa `.env.test.local`, token/cookie tạm; thu hồi session test và reset staging theo snapshot/fixture.
- Không xóa dữ liệu production. Không đánh dấu pass nếu còn lỗi RLS/isolation.
- Chỉ chuyển `progress.json`/`PROGRESS.md` sang `awaiting_approval` sau automated + staging checks; chỉ `completed` sau product-owner approval.

## Tiêu chí

**Pass:** test/build xanh, mapping/count bảo toàn, isolation đạt, member không ghi, session cũ bị revoke, UI đúng role và không lộ private fields.

**Fail:** lỗi scope/RLS, stale session còn truy cập, mapping mất, duplicate tự merge, member ghi được hoặc bất kỳ exit code khác `0`; giữ Phase 2 ở `in_progress`/`blocked` và không khóa `club_members` writes.
