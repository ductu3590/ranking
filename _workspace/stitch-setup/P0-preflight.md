# P0 — Preflight Lát 0

Ngày: 2026-09-23 · Project: `uhhlelemewilgsdijwja` · Chỉ đọc production, không chạy DDL.

## P0.1 Git

- Nhánh làm việc: `claude/tournament-stitch-recovery-review-c1723d`, worktree `C:\Users\ductu\ranking\.claude\worktrees\unified-setup-deployment-246988`.
- Base `29e33c63470c49017490fe5a2a20d7984b3b7aba`, sạch khi bắt đầu. Worktree `ranking-unified-setup-stitch-recovery` không sửa được từ phiên này (hook), nên làm trên nhánh này; cùng base.
- Plan và spec đã commit: `370c22f`.

## P0.2 Migration 097/098

| File | Đối chiếu production | Kết luận |
|---|---|---|
| `098_generalize_internal_doubles_finalize.sql` | SHA-256 file `e60515cf…abca` = `migrationSha256` trong `migration098-verification.json`; SHA-256 `pg_get_functiondef` của `finalize_internal_doubles_group_knockout_v2` = `83b5076f…792ee` = `definitionSha256` | Khớp. **Không có trong `supabase_migrations.schema_migrations`** (apply bằng script) |
| `097_fix_aggregate_draft_v3_roundtrip.sql` | `prosrc` của `save_unified_setup_aggregate_draft` giống thân hàm trong file, chỉ thiếu hai dòng comment `-- The old atomic writer…` | Khớp logic. Ledger `20260922063511 fix_aggregate_draft_v3_roundtrip` |
| `database/tests/098_generalize_internal_doubles_finalize.sql` | Bộ test SQL tự rollback | Mang sang để tham khảo |

## P0.3 Migration 091/094

Production **không chạy** bản 091 trong git:

| Hàm production | Đặc điểm | Nguồn tương ứng |
|---|---|---|
| `save_unified_setup_aggregate_draft_v1` | Dùng `selectedMemberIds`, `reserveMemberIds`; bắt buộc `name`; tự tạo tournament/division khi `p_tournament_id` null (bootstrap); không biết `memberIds`/`guests`/`startTime` | Bản 091 **ở snapshot**, không phải git |
| `save_unified_setup_aggregate_draft` | Bọc 097: chiếu `memberIds → selectedMemberIds` gọi `_v1`, rồi ghi lại nguyên `p_draft` | 097 |

- Logic ghi metadata giải (tên/ngày/địa điểm/mô tả/áp phích vào `tournaments`) của 094 **không còn chạy**: 097 đã `CREATE OR REPLACE` hàm bọc của 094.
- Replay từ git sẽ hỏng: git 091 tạo hàm dùng `memberIds`, 094 đổi tên thành `_v1`, rồi 097 gửi `selectedMemberIds` cho nó → `SETUP_PAYLOAD_INVALID`.

Lỗi thật trên production phát hiện khi đọc `_v1` + 097:

1. **Replay ghi đè bản mới.** `_v1` trả response đã cache khi gặp lại `idempotency_key`, nhưng hàm bọc 097 vẫn `UPDATE setup_draft = p_draft` mà không kiểm tra revision. Một request lưu cũ được retry muộn sẽ ghi đè bản nháp mới hơn.
2. **Fingerprint idempotency thiếu trường.** `_v1` băm bản `normalized` không có `guests`, ngày, giờ, địa điểm, mô tả, `progress`. Dùng lại key với nội dung khác ở các trường này không bị phát hiện.
3. **`tournaments.name` chỉ ghi lúc tạo.** Đổi tên giải sau lần lưu đầu không cập nhật; `event_date`/`location`/`description` không bao giờ được ghi.

Xử lý (migration mới, chưa apply; apply lúc Deploy 1):

- `099_restore_aggregate_draft_v1_definition.sql`: `CREATE OR REPLACE` `_v1` bằng đúng thân hàm production. No-op trên production, sửa được việc replay từ git.
- `100_harden_aggregate_draft_save.sql`: thay hàm bọc; khóa + nhận biết replay trước khi gọi `_v1` (replay trả trạng thái hiện tại, không ghi đè); đưa hash toàn bộ `p_draft` vào fingerprint; ghi metadata vào `tournaments`; chấp nhận draft v3.

## P0.4 Nguồn Stitch

`_workspace/stitch-internal-setup/stitch_pickleball_tournament_management_dashboard/` (26 file, 5.9 MB) + `stitch-source-manifest.json` (path, role, bytes, sha256). Đủ 5 màn chuẩn + `DESIGN.md`.

## P0.5 Skill invariants

`.claude/skills/tournament-setup-invariants/SKILL.md` mang nguyên từ snapshot; sửa theo ADR-005 ở bước tài liệu.

## P0.6 Triage snapshot

Xem `P0-snapshot-triage.md`.

## P0.7 Live schema

- `tournament_athletes`: `source ∈ {club_member, guest}`, `athlete_id` nullable, CHECK `athlete_id IS NOT NULL OR display_name_snapshot <> ''`, cột `client_ref`. **Đã có** unique index `idx_tournament_athletes_client_ref (group_id, tournament_id, client_ref) WHERE client_ref IS NOT NULL` → Lát A bỏ migration index. Hiện 192 dòng, toàn `club_member`.
- `tournament_stage_transitions`: `source_kind ∈ {group_rank, match_outcome}`; CHECK `tournament_stage_transitions_check` (định nghĩa đầy đủ lưu dưới); `target_slot ∈ {a, b}`; unique `(group_id, target_match_id, target_slot)`; index riêng theo `source_kind`.
- `tournaments`: có `name, description, location, event_date, settings, client_draft_key`.
- RPC setup/advance/unseed đều `SECURITY DEFINER`, `search_path=public` (advance/unseed thêm `lock_timeout=2s`), chỉ `service_role`.

CHECK hiện tại (lưu trước khi Lát A thay):

```sql
CHECK ((((source_kind = 'group_rank'::text) AND (source_group_label IS NOT NULL) AND (source_rank IS NOT NULL) AND (source_rank > 0) AND (source_match_id IS NULL) AND (source_outcome IS NULL)) OR ((source_kind = 'match_outcome'::text) AND (source_group_label IS NULL) AND (source_rank IS NULL) AND (source_match_id IS NOT NULL) AND (source_outcome IS NOT NULL))))
```
