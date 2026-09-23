# Deploy 1 — phần database (2026-09-23)

Project `uhhlelemewilgsdijwja`. Apply qua Supabase MCP `apply_migration` (ghi ledger).

## Migration đã apply

| Migration | Kết quả | Ghi chú |
|---|---|---|
| `099_restore_aggregate_draft_v1_definition` | OK | md5 `prosrc` sau apply = `31da06b4…2984`, trùng trước apply (no-op) |
| `100_harden_aggregate_draft_save` | OK | Trước apply đã kiểm: client đang chạy (29e33c6) sinh `clientRef` UUID/`guest-<ts>` khớp regex; 0 bản nháp có `clientRef` sai (nhóm 1, 5, 19, 46 có bản nháp mở) |
| `101_stage_transition_pool_source` | OK | `VALIDATE CONSTRAINT` qua trên dữ liệu cũ |
| `102_finalize_internal_setup_v4` | OK | Thân hàm apply giống file về logic; bản apply lược vài dòng comment tiếng Việt trong thân hàm |
| `103_advance_group_rank_transitions_v2` | OK | |

Không có `DROP TABLE`, `TRUNCATE`, `DELETE`. Hai `DROP CONSTRAINT IF EXISTS` của 101 được thay ngay bằng CHECK rộng hơn trong cùng migration.

## Kiểm thử tích hợp (một transaction, ROLLBACK)

Sinh bằng `node scripts/qa/stitch-lat-a-integration.js > database/tests/stitch_lat_a_integration.sql`. Plan dựng bằng chính `buildSetupPlan`. CLB, thành viên, giải tạm đều nằm trong transaction.

| Kiểm tra | Kết quả |
|---|---|
| A: lưu nháp v3 lần đầu (bootstrap) | revision 2; `tournaments`: tên, ngày, địa điểm, giờ bắt đầu, số sân được ghi (`IT A\|2026-10-12\|Sân IT\|07:30\|3`) |
| A: plan sửa tay (bỏ 1 trận) | `FINALIZE_PLAN_INVALID`, 0 stage được ghi |
| A: chốt 14 VĐV (13 TV + 1 khách), 2×2, hạng ba, chung kết BO3 | 13 trận; bảng A=4, B=3; `SF1,SF2@r1, BRONZE,F@r2`; `group_rank=4, match_outcome=4`; stage loại trực tiếp `match_scoring.F.best_of=3`, vòng bảng không có |
| A: khách | `tournament_athletes`: `guest\|NULL\|Khách IT\|g_it_guest_0001`; `entry_members.athlete_id` NULL |
| A: sau chốt | division `locked\|finalized\|locked`; tournament vẫn `draft` (không tự LIVE) |
| A: gửi lại cùng key | response giống hệt, vẫn 13 trận |
| A: key khác, revision cũ | `SETUP_REVISION_CONFLICT` |
| B: 18 VĐV, 3×2 + 2 ba tốt nhất | 16 trận; `group_rank=6, group_rank_pool=2, match_outcome=6`; pool `3#1, 3#2` |
| B: tiến cấp v2 thiếu một transition | `GROUP_ADVANCE_ASSIGNMENT_INVALID` |
| B: tiến cấp v2 đủ | `advanced 8, changed 8`; 4 trận tứ kết đủ hai cặp |
| C: replay lưu nháp cũ sau bản mới | `replayed: true`; bản nháp vẫn `IT C v2`, rev 3 (không bị ghi đè) |
| C: dùng lại key với payload khác | `IDEMPOTENCY_KEY_REUSED` |

Sau rollback: 0 group `itla-%`, 0 thành viên `IT VĐV %`, 0 mutation `it-%`, 0 giải `it-key-%`.

## Chưa làm (cần người dùng)

- **CLB test mới để chạy browser:** tạo CLB cần mật khẩu admin, nên người dùng tạo qua màn tạo CLB rồi đăng nhập trong khung browser. Agent không tạo tài khoản hay nhập mật khẩu.
- **Deploy app:** chưa đẩy code; cần người dùng đồng ý.
