# Lát C3 — Admin hệ thống dùng workspace setup, chốt giải cộng đồng

Trạng thái: spec · Phụ thuộc: C1, C2 · Xem [README](README.md) · Quyết định D61, D62, D63 · Migration **114**
Cần Stitch PLA-04 (Bước 2 cộng đồng, **PC + mobile**). Bước 1, 3, 4 và bàn điều hành **tái dùng** giao diện hiện có.

## 1. Mục tiêu

Admin hệ thống mở workspace setup 4 bước của giải cộng đồng; Bước 2 hiển thị **các cặp đã duyệt** (không chọn thành viên CLB);
thể thức, bốc thăm, chốt dùng đúng pipeline `buildSetupPlan` → `finalize_internal_setup_v4`; sau chốt giải điều hành và công
khai như mọi giải v4 (Epic 2). Chạy thật tới cuối giải.

## 2. Khoảng trống phải đóng (đã kiểm)

| Khoảng trống | Xử lý |
|---|---|
| `setup/route.js` và `setup/finalize/route.js` dùng `requireValidatedGroupAdmin()` (chỉ phiên CLB) | Chuyển sang `requireTournamentAccess({ tournamentId/divisionId, need:'write' })` cho **mọi** giải (giữ hành vi phiên CLB nguyên vẹn); platform actor chỉ qua được với giải cộng đồng (`resolveTournamentWrite`). Test ma trận quyền: CLB admin vẫn chỉ giải của CLB mình; `community_admin` không chạm giải CLB |
| `loadMemberContext` (`setupServer.js`) chỉ nạp `club_members` theo `group_id` | Giải cộng đồng: `ctx.community` (mới) thay cho `ctx.members`; `participants.memberIds`/`guests` **rỗng và bị chặn** (giống D49 giao hữu) — blocker `COMMUNITY_MEMBER_PICK_NOT_ALLOWED` |
| `ORGANIZER_MODES` trong `setupDraftV3.js` = internal, friendly | Thêm `community`; `normalizeDraft` giữ nguyên với hai mode cũ (test khóa) |
| `tournament_athletes.source` CHECK ∈ (`club_member`,`guest`) | 114 mở thành (`club_member`,`guest`,`community`) |
| participantRef chỉ `member:`/`guest:` | Thêm `player:<accountId>`; quy tắc §3 |
| Ai là "CLB" của cặp (spread bốc thăm, D17) | Bất kỳ: giải cộng đồng **không rải theo CLB** — `clubSpread` bị bỏ qua (mọi cặp cùng "nguồn"); cảnh báo `DRAW_SAME_CLUB_IN_GROUP` **không** phát |

## 3. Domain

- `lib/tournament/communitySetup.js` (mới, thuần): `buildCommunityContext({ registrationRows, memberRows, capacity })` →
  `{ approvedPairs:[{ pairId, participantRefs, memberNames, feeConfirmed }], pendingCount, waitlistCount, feeUnconfirmedCount }`.
  - Khóa cặp hiệu lực: `r<registrationId>.<version>` với `version` = `tournament_registrations.version` lúc duyệt. Sửa đơn hoặc đổi
    thành viên → version đổi → `planInputSignature` đổi → Bước 4 `DRAW_STALE`, finalize `COMMUNITY_ROSTER_CHANGED` (fail closed, cùng cơ chế
    `friendlyPairKey` — **không** cơ chế đồng bộ riêng).
  - `participantRefs`: `player:<accountId>` cho từng ghế; hai ghế khác tài khoản, không trùng giữa các cặp.
  - Cặp đã chốt bởi RPC ghép (C2) là **cố định và khóa** trong setup; BTC không kéo/ghép lại ở Bước 2 (đã ghép ở bảng duyệt).
- `setupStepRules.js`: Bước 2 nhánh `community` — blocker `COMMUNITY_TOO_FEW_PAIRS` (theo `setupFormats.minPairs` của thể thức đã chọn),
  `COMMUNITY_PENDING_REGISTRATIONS` **là cảnh báo**, không blocker (đơn chờ duyệt còn lại không vào giải); `COMMUNITY_AWAITING_PARTNER`
  cảnh báo tương tự; phí chưa thu: **cảnh báo có nội dung** ("N cặp chưa xác nhận thu phí"), không chặn (D56).
- `setupPlans`: **không đổi** — `buildSetupPlan` nhận danh sách cặp giống nhau bất kể nguồn (đã đúng cho giao hữu).

## 4. Migration 114 — `finalize_internal_setup_v4`

Dựng từ **bản mới nhất (111)**, KHÔNG từ bản cũ. Một nhánh mới `community` (tournament `organizer_type='community'`):
1. Kiểm phiên: người gọi là service role; giải cộng đồng; division thuộc giải; không có trận bắt đầu/tỉ số (bất biến §3.6).
2. Dựng `v_community_pairs` từ `tournament_registrations` `approved` của division, sắp theo id tăng dần, khóa `r<id>.<version>`; **so tập
   khóa với plan** đã tính lại trên server → lệch → `COMMUNITY_ROSTER_CHANGED` (`PH409`).
3. Mỗi ghế: tìm `player_accounts` → nếu `athlete_id IS NULL` **tạo `athletes`** (`display_name`, `normalized_name`, `status='active'`,
   **không** `legacy_club_member_id`) và gán lại vào `player_accounts.athlete_id` **trong cùng transaction**; ghi `tournament_athletes`
   `source='community'`, `athlete_id` đã có. Không vào danh bạ/xếp hạng CLB nào.
4. Tạo entry, stage, trận, `tournament_stage_transitions` như nhánh hiện có (không sao chép logic: dùng chung phần dưới của hàm).
5. Chốt xong: giải `private` → `unlisted` + `public_slug` (như D50) nếu cần; trạng thái đi theo `prepare_tournament_after_finalize` (109) như mọi giải v4.
6. Đơn còn `submitted`/`awaiting_partner`/`rejected` **không** bị xoá và **không** đổi trạng thái (tránh thêm trạng thái mới). Trang "Đơn của tôi" hiển thị "Giải đã chốt danh sách" dựa trên `tournaments.status`.

**Test khóa** (mẫu `tests/stitch-setup/lat-c/api-contract.test.js`): 114 so với 111 chỉ khác ở: nhánh `community` (điều kiện, dựng cặp, tạo `athletes`, tra tập khóa)
và kiểm tra `source`; phần còn lại byte-giống sau chuẩn hóa. Kiểm thử tích hợp ROLLBACK: 8 cặp → 8 entry, 16 `tournament_athletes` `source='community'`,
16 `player_accounts.athlete_id` khác NULL, `athletes` mới đúng 16 (0 nếu tài khoản đã có `athlete_id`); chạy hai lần → không sinh thêm `athletes` (idempotent).
Không DROP/TRUNCATE; trước apply: ROLLBACK, sau apply: `md5(prosrc)` = file.

## 5. Giao diện (Stitch PLA-04, PC + mobile)

Bước 2 cộng đồng: bảng/thẻ **cặp đã duyệt** (tên cặp, PHR, chip phí), bộ đếm `N cặp · M chờ duyệt · K đang tìm bạn`, nút "Mở bảng duyệt".
Không hộp chọn thành viên, không nút "Thêm khách". Bước 1: thêm khối "Đăng ký" (đóng/mở, hạn chót) chỉ cho giải cộng đồng. Bước 3, 4, bàn điều hành: **không đổi**.

## 6. Test và nghiệm thu

- Node: `communitySetup` (khóa cặp, refs, cảnh báo), `setupStepRules` nhánh community, ma trận quyền setup, khóa 114 vs 111, hồi quy 3 nhánh cũ (nội bộ, giao hữu, loại kép) **không đổi hành vi**.
- `npm run test:stitch-setup` xanh (thêm epic-4); test cũ không sửa.
- Chạy thật ở 390px và 1280px: Ca G tới hết giải — 8 cặp, vòng bảng + loại trực tiếp, nhập hết tỉ số, kết thúc chặng, xem BXH và trang công khai; kiểm không lộ SĐT.
- Báo cáo: `_workspace/epic-4-community/evidence.md`, `pr-epic-4.md`; PR nháp; người dùng tự merge (D63).
