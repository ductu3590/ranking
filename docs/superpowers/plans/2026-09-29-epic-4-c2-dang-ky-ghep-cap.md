# Epic 4 · Lát C2 — Đăng ký giải, rủ ghép cặp, duyệt, phí, công khai: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps dùng checkbox `- [ ]`.

**Goal:** VĐV đã đăng nhập đăng ký giải cộng đồng (đơn/đôi), rủ ghép cặp an toàn, theo dõi đơn; admin hệ thống tạo giải, duyệt/từ chối/ghép hộ/đánh dấu thu phí; trang công khai chỉ hiện tên cặp đã duyệt.

**Architecture:** Domain thuần bọc `openRegistration.js` (không sao chép luật). Mọi thao tác ghi nhiều bước là **RPC nguyên tử** (migration 113, service role, `PH409` cho xung đột). Route mỏng gọi RPC. Giao diện bám Stitch (project `11027657519607899722`, ID ở `_workspace/stitch-internal-setup/canonical/community/README.md`).

**Spec:** `docs/superpowers/specs/2026-09-29-epic-4-community/lat-c2-dang-ky-ghep-cap.md` (nguồn sự thật cho shape, mã lỗi). **Phụ thuộc:** C1 đã lên nhánh (migration 112, phiên VĐV).

**Quy ước:** test ở `tests/stitch-setup/epic-4/c2-*.test.js`; không sửa test cũ; dữ liệu test tiền tố `TEST-CD` trong group 8; không DROP/TRUNCATE.

## Bản đồ file

| File | Việc |
|---|---|
| `lib/tournament/communityRegistration.js` | `validateCommunitySubmission`, `communityRegistrationState`, `feeState`, `nextAdminActions` |
| `lib/tournament/communityPublic.js` | `projectPublicPairs`, danh sách khóa cấm |
| `lib/tournament/communityPartnerLink.js` | phát/băm/hết hạn token link rủ, `partnerLinkPath` |
| `lib/tournament/communityMessages.js` (sửa) | thêm mã `COMMUNITY_*` |
| `database/migrations/113_community_registrations.sql` | cột + ràng buộc + 5 RPC |
| `database/tests/epic4_c2_integration.sql` + `scripts/qa/epic4-c2-integration.js` | ROLLBACK |
| `lib/communityServer.js` | nạp dữ liệu, gọi RPC, ánh xạ `PH409` → mã ổn định |
| `app/api/tournament-v2/community/**` | route VĐV (register, my, partner-link, join, invites, partner-board, withdraw) |
| `app/api/tournament-v2/public/community/[slug]/pairs/route.js` | công khai: tên cặp đã duyệt |
| `app/api/tournament-v2/community/admin/**` | route admin (danh sách giải, duyệt, phí, ghép hộ) |
| `app/api/tournament-v2/public/registration` + `public/pair-invite` (sửa) | 401 với giải cộng đồng |
| `app/cong-dong/**` | PLC-01, 04, 05, 06, 07; `app/cong-dong/quan-tri/**` PLA-02, 03 |

## Task 1 — Domain (thuần, TDD)
- [ ] `tests/stitch-setup/epic-4/c2-registration-domain.test.js` (đỏ) → cài `communityRegistration.js`, `communityPublic.js`, `communityPartnerLink.js`, thêm thông điệp → xanh.
- [ ] Commit.

## Task 2 — Migration 113 + RPC
- [ ] Test tĩnh `c2-migration-static.test.js` (additive; cột; ràng buộc duy nhất từng phần; 5 RPC `SECURITY DEFINER SET search_path = public`, `REVOKE … FROM PUBLIC, anon, authenticated`, `GRANT … TO service_role`; không DROP/TRUNCATE/DELETE; không ALTER bảng ngoài danh sách).
- [ ] Viết `113_community_registrations.sql` (spec §2). Sinh SQL tích hợp ROLLBACK bằng `scripts/qa/epic4-c2-integration.js` và chạy qua Supabase MCP → `zz.ALL = ok`.
- [ ] Apply (`apply_migration`), so `md5(prosrc)` từng hàm với file. Commit.

## Task 3 — Lớp server + route
- [ ] `c2-route-contract.test.js` + `c2-permission-matrix.test.js` (ma trận VĐV/admin/CLB/ẩn danh; route công khai không có khóa cấm).
- [ ] Cài `lib/communityServer.js` + route. Sửa `public/registration`, `public/pair-invite` trả 401 `PLAYER_SESSION_REQUIRED` cho giải cộng đồng.
- [ ] Commit.

## Task 4 — Giao diện (bám Stitch PC + mobile)
- [ ] `c2-ui-contract.test.js`, cài trang PLC-01/04/05/06/07 và PLA-02/03; nghiệm thu ở 390px + 1280px.
- [ ] Commit.

## Task 5 — Nghiệm thu
- [ ] `npm run test:stitch-setup` xanh; Ca G phần đăng ký + duyệt (README spec §6) trên browser; cập nhật `_workspace/epic-4-community/evidence.md`; push.
