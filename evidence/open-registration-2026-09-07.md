# Evidence — Đăng ký mở giải cộng đồng (Open Registration)

Ngày: 2026-09-07
Nhánh: `spec/tournament-open-registration`
Project Supabase: `uhhlelemewilgsdijwja`

Tài liệu này là bằng chứng cho **Task H2** của kế hoạch
[docs/superpowers/plans/2026-09-07-tournament-open-registration.md](../docs/superpowers/plans/2026-09-07-tournament-open-registration.md):
kiểm thử thực tế trên Supabase hiện hữu + xác nhận build/regression xanh.

---

## 1. Kết quả test hợp đồng — `npm run test:open-registration`

```
> quy-pickleball@0.1.0 test:open-registration
> node tests/open-registration/domain.test.js && node tests/open-registration/api.contract.test.js && node tests/open-registration/ui.contract.test.js

open-registration domain: OK
open-registration api contract: OK
open-registration ui contract: OK
EXIT=0
```

3 lớp (domain / API contract / UI contract) đều PASS.

## 2. Kết quả test tích hợp thật — `npm run test:open-registration-live`

Test này khởi động `next dev` thật (port 4199), gọi API qua HTTP thật, mutate
qua PostgREST thật trên database hiện hữu, rồi dọn sạch theo id đã tạo.

```
> quy-pickleball@0.1.0 test:open-registration-live
> node tests/open-registration/live.integration.test.js

open-registration live integration: OK
EXIT=0
```

Phạm vi phủ của live test (đã mở rộng trong lần này):

- **Danh sách giải cộng đồng**: `GET /api/tournament-v2/public/community` trả giải test với `organizer_mode='community'`.
- **Nộp đăng ký đôi hợp lệ** + **chống trùng SĐT** (`POST /public/registration` → 200; nộp lại cùng SĐT → 409 `DUPLICATE_PHONE`).
- **Sức chứa & waitlist**: admit tới đầy cap → đăng ký kế tiếp `submitted` + `waitlist_position`.
- **Tra cứu trạng thái** theo `track_token` và theo SĐT (`GET /public/registration/status`).
- **Luồng ghép cặp end-to-end (mới)** — vùng mutate nhiều bản ghi nhất, trước đây chưa có e2e:
  - Nội dung đôi `gender_mode='mixed'`, `registration_capacity=4`.
  - 2 đăng ký SOLO (1 nam + 1 nữ) → cả hai `status='awaiting_partner'`, `needs_partner=true`.
  - `POST /public/pair-invite` (track_token của A mời B) → lời mời `pending`.
  - `PATCH /public/pair-invite` (track_token của B, `action='accept'`) → `accepted`.
  - BTC `PATCH /registrations` `action='approve_pair'` (primary=A, secondary=B) → A: `status='submitted'`, `needs_partner=false`, đúng **2 member** (ghế 1 và 2); B: `status='merged'`, `merged_into=A.id`.
  - **Ca lỗi**: ghép 2 người CÙNG giới ở nội dung mixed → **400 `MIXED_GENDER_REQUIRED`**.
  - **Ca lỗi**: ghép 2 người TRÙNG SĐT → **400 `DUPLICATE_IN_PAIR`**.
- **Dọn dữ liệu**: xoá theo đúng id đã tạo (pair-invites → registrations theo `division_id` → divisions → tournament). KHÔNG dùng `DROP`/`TRUNCATE`.

> Bug phát hiện & sửa trong lúc mở rộng test: nhánh `approve_pair` ở
> [app/api/tournament-v2/registrations/route.js](../app/api/tournament-v2/registrations/route.js)
> trước đây tự động chuyển primary sang `approved` khi còn chỗ. Theo plan (mục D3), việc
> nhận vào giải (`approved`) là bước admit RIÊNG của BTC. Đã sửa CODE để cả `pair` và
> `approve_pair` chỉ gộp thành một đăng ký `submitted` — không nới lỏng test.

## 3. Build — `npm run build`

```
✓ Compiled successfully
BUILD_EXIT=0
```

- Số cảnh báo `Unsupported metadata viewport` sau khi sửa: **0** (đã tách
  `export const viewport` khỏi `export const metadata` ở
  [app/layout.js](../app/layout.js) — root layout, phủ mọi route con gồm `/dk` và `/dk/theo-doi`).
- Các log `Dynamic server usage` còn lại là hành vi mong đợi của các route
  `force-dynamic` (đọc `request.url`), không phải lỗi build; build EXIT=0.

## 4. Danh sách route mới

Public (không cần đăng nhập):

- `GET /api/tournament-v2/public/community` — danh sách giải cộng đồng đang mở.
- `GET /api/tournament-v2/public/registration` — chi tiết giải/nội dung để hiển thị form.
- `POST /api/tournament-v2/public/registration` — nộp đăng ký công khai (rate-limit + honeypot + chống trùng SĐT).
- `GET /api/tournament-v2/public/registration/status` — tra cứu trạng thái theo `track_token` hoặc SĐT.
- `GET /api/tournament-v2/public/pair-invite` — danh sách VĐV lẻ + lời mời của tôi.
- `POST /api/tournament-v2/public/pair-invite` — gửi lời mời ghép cặp.
- `PATCH /api/tournament-v2/public/pair-invite` — chấp nhận / từ chối / huỷ lời mời.

BTC (đã có, mở rộng action open-reg):

- `PATCH /api/tournament-v2/registrations` — thêm action `admit`/`remove`/`restore`/`reject_open`/`withdraw_open`/`pair`/`approve_pair`.
- `GET /api/tournament-v2/registrations/board` — bảng duyệt nhóm theo trạng thái + waitlist.
- `PATCH /api/tournament-v2/divisions` — cấu hình mở đăng ký (open/capacity/deadline/gender_mode…).

Trang công khai:

- `/dk` — danh sách giải cộng đồng.
- `/dk/[slug]/[division]` — trang đăng ký chi tiết (đơn/đôi theo cấu hình).
- `/dk/theo-doi` — trang theo dõi trạng thái + tự rủ ghép cặp.

## 5. Migration 042

- File: [database/migrations/042_open_registration.sql](../database/migrations/042_open_registration.sql).
- **Đã apply** trên project `uhhlelemewilgsdijwja` (qua Supabase MCP `apply_migration`).
- **Đã verify schema**: các cột mới trên `tournament_divisions`
  (`registration_open`, `registration_capacity`, `registration_deadline`,
  `allow_late_registration`, `gender_mode`, `age_min`, `age_max`, `entry_fee`),
  trên `tournament_registrations` (`origin`, `contact_phone_norm`,
  `self_declared_club`, `needs_partner`, `track_token`, `admitted_at`,
  `queue_seq`, `merged_into`), bảng `tournament_registration_members`, bảng
  `tournament_pair_invites` — tất cả tồn tại đúng.
- **RLS**: đã bật/verify chính sách cho các bảng mới theo scope `group_id`,
  đọc công khai qua service-role ở route handler (không expose anon insert
  trực tiếp; ghi đi qua API có rate-limit + honeypot).
- Migration idempotent (`add column if not exists`, guard constraint qua
  `pg_constraint`), không `DROP`/`TRUNCATE`.

## 6. Xác nhận dọn dữ liệu test

Toàn bộ dữ liệu test do live integration tạo (giải `[TEST] Open Registration …`,
các nội dung, đăng ký, member, lời mời) được xoá theo đúng id đã tạo ở block
`finally` của test. **Đã xác nhận không còn dữ liệu test tồn đọng và không đụng
đến dữ liệu CLB đang hoạt động thật.** Không dùng `DROP`/`TRUNCATE`/reset.
