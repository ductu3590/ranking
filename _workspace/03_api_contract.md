# Tournament API Contract (v2) — for ui-dev & qa

Mọi route dưới `app/api/tournament-v2/`. `db = supabaseAdmin || supabaseServer`. Mọi query scope `group_id` (lấy từ session, không hardcode). Browser KHÔNG truy vấn Supabase trực tiếp — fetch qua route.

Quy ước lỗi: `{ error: string }` kèm HTTP status. 403 nếu ghi mà không phải admin. 404 nếu stage không thuộc group. 400 nếu engine/format lỗi hoặc thiếu input. 500 nếu Supabase lỗi.

Standings shape KHÁC nhau theo `schedule_format` (xem `02_engine_api.md` mục 2a/2b) — UI/qa phải nhánh theo field này.

---

## GET /api/tournament-v2/standings — tính BXH khi đọc (public)

Đọc public qua `getEffectiveGroupContext()` (không cần admin). Tính BXH on-read từ games đã nhập (không lưu BXH).

**Query**: `?stageId=<id>` (bắt buộc).

**Response 200**:
```json
{
  "schedule_format": "round_robin",   // | "knockout"
  "standings": [ /* Row[] theo format, xem 02_engine_api.md */ ]
}
```
- `round_robin` row: `{ entrant_id, played, won, lost, games_won, games_lost, points_for, points_against, diff, match_points, group_label, seed, rank }`.
- `knockout` row: `{ entrant_id, exit_round, seed, rank }`.

**Lỗi**: 400 `stageId is required` / format lạ. 404 `Stage không tồn tại`.

---

## POST /api/tournament-v2/advance — chuyển stage (mix, admin)

Guard `requireGroupAdmin()`. Tính standings stage hiện tại → `seedNextStage` → ghi seeding vào `tournament_stage_entrants` của stage kế (xóa rồi insert), cập nhật status.

**Body**: `{ "stageId": <id> }`.

**Response 200 (còn stage kế)**:
```json
{ "success": true, "nextStageId": <id>, "advanced": <number> }
```

**Response 200 (đây là stage cuối — không có stage kế)**:
```json
{ "success": true, "final": true, "champion": [ { "entrant_id", "seed_in_stage", "id", "seed", "from_group?", "from_rank?" } ] }
```

**Tác dụng phụ**:
- `tournament_stage_entrants` của stage kế bị xóa và thay bằng `{ group_id, stage_id, entrant_id, seed_in_stage }`.
- Stage hiện tại `status='completed'`; stage kế `status='pending'`.

**Lỗi**: 403 (không admin). 400 `stageId is required` / `Stage chưa hoàn tất` (chưa đủ match `done`) / format lạ. 404 `Stage không tồn tại`.
