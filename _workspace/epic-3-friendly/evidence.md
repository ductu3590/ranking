# Epic 3 — Bằng chứng triển khai

## F1 — migration 110 (2026-09-25 22:27 +07)

Project Supabase `uhhlelemewilgsdijwja` ("Ranking 246", production). Kênh duy nhất: Supabase MCP (`execute_sql`,
`apply_migration`, `list_migrations`); nội dung SQL chép nguyên văn từ file. Quy trình ADR-007 D45: ROLLBACK trước,
md5 sau. Preflight (supervisor): không policy RLS trên `tournament_clubs` / `club_notifications`, chủ bảng `postgres`,
tên hàm/constraint/index mới chưa dùng, migration mới nhất trên DB là 109.

### Bước 1 — Kiểm thử tích hợp trong transaction (ROLLBACK)

- Sinh lại: `node scripts/qa/epic3-f1-integration.js > database/tests/epic3_f1_integration.sql` → 1266 dòng,
  77 434 byte, không khác bản đã commit (git status sạch). `grep COMMIT` chỉ khớp `ON COMMIT DROP` (dòng 673);
  không có lệnh COMMIT/END cấp ngoài.
- Gửi nguyên văn toàn bộ file (kể cả comment) trong **một** lần `execute_sql`.
- Kết quả: **đạt**. Không lỗi SQL, không `IT_FAIL`. Bảng `it_result` trả về 94 dòng (42 ca `it_ok` + 51 ca `it_err`
  + `zz.ALL`), dòng `zz.ALL = ok`. `g19.invited = ok` (CLB 19 có trên DB, chỉ trong transaction).
- Post-check (`--post-check`) sau ROLLBACK: `groups_tmp = 0, members_tmp = 0, tournaments_tmp = 0,
  notifications_tmp = 0, mutations_tmp = 0`.

### Bước 2 — Apply

- File: `database/migrations/110_friendly_club_rosters.sql` (684 dòng). Đã bỏ dòng 16 `BEGIN;` và dòng 684 `COMMIT;`
  (apply_migration tự bọc transaction); phần còn lại gửi nguyên văn. Thân migration (dòng 17–683) trùng byte-for-byte
  với dòng 7–672 của file kiểm thử đã chạy đạt ở Bước 1 (kiểm bằng `diff`, chỉ khác một dòng trống đầu).
- Lệnh: `apply_migration(project_id = uhhlelemewilgsdijwja, name = "110_friendly_club_rosters")` → `success: true`.
- `list_migrations`: có `20260925152307 110_friendly_club_rosters` (ngay sau `109_prepare_tournament_after_finalize`).

### Hậu kiểm

md5(prosrc) — kỳ vọng từ `node scripts/qa/epic3-f1-integration.js --md5`, thực tế từ `pg_proc`:

| Hàm | Kỳ vọng | Thực tế | Khớp |
|---|---|---|---|
| friendly_sync_notifications | 5ace3341a9cb3e982df3405b4c37371c | 5ace3341a9cb3e982df3405b4c37371c | ✓ |
| friendly_invite_club | fcfbee57ffa00cb1b25285aee162c1b7 | fcfbee57ffa00cb1b25285aee162c1b7 | ✓ |
| friendly_club_action | 4bc5639bb5799b86f530b7acc6ae423b | 4bc5639bb5799b86f530b7acc6ae423b | ✓ |
| set_friendly_registration_window | 5fb2405536d092353325d225298ac06f | 5fb2405536d092353325d225298ac06f | ✓ |

Cột mới trên `tournament_clubs` (9/9): `roster_draft jsonb NOT NULL DEFAULT '{}'::jsonb`, `roster_submitted jsonb`,
`roster_submitted_at timestamptz`, `roster_reviewed_at timestamptz`, `responded_at timestamptz`,
`roster_approved_version bigint`, `review_note text`, `invite_token_hash text`, `invite_token_issued_at timestamptz`.

Constraint (4/4): `tournament_clubs_roster_draft_object_ck`, `tournament_clubs_roster_submitted_object_ck`,
`tournament_clubs_review_note_length_ck` (2–300 sau btrim), `tournament_clubs_invite_token_hash_ck` (`^[a-f0-9]{64}$`).

Index (2/2):
- `idx_tournament_clubs_club_tournament` — btree `(club_id, tournament_id) WHERE club_id IS NOT NULL`
- `idx_tournament_clubs_invite_token` — UNIQUE btree `(invite_token_hash) WHERE invite_token_hash IS NOT NULL`

Quyền EXECUTE (`has_function_privilege`):

| Hàm | anon | authenticated | service_role | SECURITY DEFINER |
|---|---|---|---|---|
| friendly_invite_club | false | false | true | true |
| friendly_club_action | false | false | true | true |
| set_friendly_registration_window | false | false | true | true |
| friendly_sync_notifications | false | false | false | false |

### Chạy lại sau khi apply (`--applied`)

- `node scripts/qa/epic3-f1-integration.js --applied` → ghi ra thư mục scratch (không ghi đè file trong repo);
  602 dòng = 8 dòng đầu mới (BEGIN + ghi chú "110 đã apply") + phần ca kiểm trùng byte-for-byte dòng 673–1266 của file
  ROLLBACK. Gửi nguyên văn một lần `execute_sql`.
- Kết quả: **đạt**, 94 dòng `it_result`, `zz.ALL = ok`, không lỗi.
- Post-check dữ liệu tạm sau đó: cả 5 cột = 0.

Không chạy DROP/TRUNCATE/DELETE/UPDATE nào trên dữ liệu thật; group 1 không bị đụng (host kiểm thử là group 59,
khách tạm + CLB 19 chỉ trong transaction đã ROLLBACK).
