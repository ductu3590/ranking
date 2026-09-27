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

## F2 — migration 111 (2026-09-27 10:56 +07)

Project Supabase `uhhlelemewilgsdijwja` (production). Kênh duy nhất: Supabase MCP (`execute_sql`, `apply_migration`,
`list_migrations`); SQL chép nguyên văn từ file. Quy trình ADR-007 D45: ROLLBACK trước, md5 sau. Preflight (supervisor):
hàm đang chạy md5 `73d5ad132226394e9bdac0c0d755dd9a` (= 108), acl `{postgres=X/postgres,service_role=X/postgres}`,
`search_path=public`; đủ cột/RPC; migration mới nhất trên DB là 110; chưa có giải friendly nào.

### Bước 1 — Kiểm thử tích hợp trong transaction (ROLLBACK)

Hai lần chạy đầu dừng vì lỗi logic của file kiểm thử trên ràng buộc production (không phải lỗi 111, không ghi gì):

1. (HEAD `b1b18fb`) `23505` `idx_club_members_group_full_name`: `pg_temp.f2_members` đặt tên VĐV tạm
   `'ZZF2 VĐV ' || g || '-' || k` lặp giữa các ca → trùng `(59, zzf2 vđv 59-1)`. Supervisor sửa ở `ba4bd48`
   (hậu tố `nextval('pg_temp.it_member_seq')`).
2. (HEAD `f630f7d`, file = `ba4bd48`) `23503` `club_member_athlete_map_legacy_fk`: ca `athlete_duplicate` chạy
   `UPDATE public.club_members SET group_id = ga WHERE id = hm1` → `Key (id, group_id)=(412, 59) is still referenced from
   table "club_member_athlete_map"`. Supervisor sửa ở `2e33557`: ca không dựng được trên production
   (`athletes.legacy_club_member_id` UNIQUE + FK trên) → thay bằng khẳng định `neg.athlete_duplicate.unreachable`.

Sau mỗi lần lỗi: post-check = 0 mọi cột; hàm vẫn md5 `73d5ad13…` (108).

Lần chạy đạt (HEAD `2e33557`):

- Sinh lại: `node scripts/qa/epic3-f2-integration.js > database/tests/epic3_f2_integration.sql` → 780 dòng, 97 975 byte,
  trùng bản đã commit (git status sạch với file này). `grep COMMIT` chỉ khớp `ON COMMIT DROP` (dòng 557); kết thúc `ROLLBACK;`.
- Gửi nguyên văn toàn bộ file (kể cả comment) trong **một** lần `execute_sql`.
- Kết quả: **đạt**. Không lỗi SQL, không `IT_FAIL`; `it_result` 42 dòng, dòng cuối `zz.ALL = ok`. Giá trị chính:
  `setup.guest_a = 19`; `g1.finalize.match_count = 12` (entries 4 chủ nhà / 3 khách, `g1.matches.interclub` 6/9 trận bảng
  liên CLB, `g1.replay`, `g1.after.guest_closed = FRIENDLY_REGISTRATION_CLOSED`, `d50.after` ok); `g1b… = 13`;
  `core3… = 12` (`limit.over = FRIENDLY_CLUB_LIMIT_REACHED` với hạn mức 1); `ko… = 6`, `ko.round1.no_same_club` ok;
  `internal14.match_count = 12`; `internal.round_robin = 6`, `internal.knockout = 4`, `internal.double_elimination = 6`.
  Ca âm đúng mã: `d49.host_guest = FRIENDLY_HOST_GUEST_NOT_ALLOWED`, `max.missing / max.zero / max.over_core / max.string =
  FINALIZE_PLAN_INVALID`, `mode.settings_mismatch = FINALIZE_DRAFT_INVALID`, `not_ready = FRIENDLY_CLUB_NOT_READY`,
  `inactive = MEMBER_NOT_ACTIVE_IN_GROUP`, `guest_ref = FRIENDLY_GUEST_NOT_ALLOWED`, `ref_not_submitted = PAIRING_INVALID`,
  `quota = FRIENDLY_QUOTA_EXCEEDED`, `roster_changed = FRIENDLY_ROSTER_CHANGED`, `external = EXTERNAL_CLUB_NOT_SUPPORTED`,
  `too_few = FRIENDLY_CLUBS_TOO_FEW`; `neg.athlete_duplicate.unreachable` ok.
- Post-check (`--post-check`) sau ROLLBACK: `groups_tmp = 0, members_tmp = 0, athletes_tmp = 0, tournaments_tmp = 0,
  notifications_tmp = 0, mutations_tmp = 0`.

### Bước 2 — Apply

- File: `database/migrations/111_finalize_v4_friendly.sql` (576 dòng; LF trong git, CRLF ở working copy). Đã bỏ dòng 24
  `BEGIN;` và dòng 576 `COMMIT;` (apply_migration tự bọc transaction); phần còn lại (dòng 1–23 comment + 25–575) gửi
  nguyên văn, xuống dòng LF. Thân migration dòng 26–575 trùng byte-for-byte (sau khi bỏ CR) với dòng 6–555 của file kiểm
  thử đã chạy đạt (kiểm bằng `diff`/`cmp`; chỉ khác một dòng trống đầu).
- Lệnh: `apply_migration(project_id = uhhlelemewilgsdijwja, name = "111_finalize_v4_friendly")` → `success: true`.
- `list_migrations`: có `20260927035601 111_finalize_v4_friendly` (ngay sau `20260925152307 110_friendly_club_rosters`).

### Hậu kiểm

| Mục | Kỳ vọng | Thực tế | Khớp |
|---|---|---|---|
| md5(prosrc) `finalize_internal_setup_v4` (`--md5`) | c1ab7d4d96db9353185fc15ec8377bde | c1ab7d4d96db9353185fc15ec8377bde | ✓ |
| proacl | `{postgres=X/postgres,service_role=X/postgres}` | `{postgres=X/postgres,service_role=X/postgres}` | ✓ |
| prosecdef | true | true | ✓ |
| proconfig | `{search_path=public}` | `{search_path=public}` | ✓ |
| `has_function_privilege` anon / authenticated / service_role | false / false / true | false / false / true | ✓ |

Một hàng `pg_proc` duy nhất cho `finalize_internal_setup_v4` (không sinh overload).

### Chạy lại sau khi apply (`--applied`)

- `node scripts/qa/epic3-f2-integration.js --applied` → ghi ra thư mục scratch (không ghi đè file trong repo); 231 dòng =
  7 dòng đầu (BEGIN + ghi chú "111 đã apply") + phần ca kiểm trùng byte-for-byte dòng 557–780 của file ROLLBACK. Gửi
  nguyên văn một lần `execute_sql`.
- Kết quả: **đạt**, 42 dòng `it_result`, `zz.ALL = ok`, mọi giá trị giống lần ROLLBACK.
- Post-check dữ liệu tạm sau đó: cả 6 cột = 0.

Không chạy DROP/TRUNCATE/DELETE/UPDATE nào trên dữ liệu thật; group 1 không bị đụng (host kiểm thử là group 59, khách
CLB 19 + group tạm chỉ trong transaction đã ROLLBACK). Không sửa code.
