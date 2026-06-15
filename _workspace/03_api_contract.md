# Tournament API Contract (v2) — for ui-dev & qa

Mọi route dưới `app/api/tournament-v2/`. `db = supabaseAdmin || supabaseServer`. Mọi query scope `group_id` (lấy từ session, không hardcode). Browser KHÔNG truy vấn Supabase trực tiếp — fetch qua route (ngoại lệ: Realtime live qua `@/lib/supabaseClient`).

## Quy ước chung

- **Auth**:
  - Ghi (POST/PATCH/DELETE) → `requireGroupAdmin()`; nếu không phải admin trả **403** `{ error }` (route tự trả qua `adminCheck.response`).
  - Đọc (GET) → `getEffectiveGroupContext()` (public, có fallback `DEFAULT_GROUP_ID`). Không chặn admin.
- **Lỗi**: luôn `{ error: string }` kèm HTTP status. 400 thiếu input / engine|format lỗi. 404 không thuộc group. 500 Supabase lỗi.
- **Scope**: mọi query `.eq('group_id', groupId)` + `tournament_id`/`stage_id` đúng ngữ cảnh.

> **Standings divergence — UI/qa BẮT BUỘC nhánh theo `schedule_format`.** Hàng BXH `round_robin` có **13 field**, `knockout` chỉ **4 field**. Xem mục Standings.

---

## GET /api/tournament-v2/tournaments — danh sách giải (public)

- **Query**: không.
- **200**: `{ "tournaments": Tournament[] }` (sắp xếp `event_date` desc). Mảng rỗng nếu chưa có.
- `Tournament`: `{ id, group_id, name, description, event_date, status, location, entrant_type, public_slug, settings, created_at, updated_at }`.

## POST /api/tournament-v2/tournaments — tạo giải (admin)

- **Body** (allowlist): `{ name* , description?, event_date?, status?='draft', location?, entrant_type?='pair', public_slug?(auto-slugify nếu thiếu), settings?={} }`.
- **200**: `{ "success": true, "tournament": Tournament }`.
- **Lỗi**: 403 không admin. 400 `Tournament name is required`.

## PATCH /api/tournament-v2/tournaments — sửa giải (admin)

- **Body**: `{ id*, ...field cho phép }`. Không đổi `group_id`.
- **200**: `{ "success": true, "tournament": Tournament }`.
- **Lỗi**: 403. 400 `Tournament id is required` / `Tournament name is required` (nếu name set rỗng).

## DELETE /api/tournament-v2/tournaments — xóa giải (admin)

- **Query**: `?id=<id>` (bắt buộc).
- **200**: `{ "success": true }`.
- **Lỗi**: 403. 400 `Tournament id is required`.

---

## GET /api/tournament-v2/stages — stage của 1 giải (public)

- **Query**: `?tournamentId=<id>` (bắt buộc).
- **200**: `{ "stages": Stage[] }` (sắp `stage_order` asc).
- `Stage`: `{ id, group_id, tournament_id, stage_order, name, schedule_format, match_format, status, config }`.
  - `schedule_format` ∈ `round_robin | knockout`.
  - `match_format` ∈ `simple | mlp`.
  - `status` ∈ `pending | active | completed`.
- **Lỗi**: 400 `tournamentId is required`.

## POST /api/tournament-v2/stages — tạo stage (admin)

- **Body**: `{ tournament_id*, name*, schedule_format*, stage_order?(auto +1 nếu thiếu), match_format?='simple', status?='pending', config?={} }`.
- **200**: `{ "success": true, "stage": Stage }`.
- **Lỗi**: 403. 400 `tournament_id is required` / `Stage name is required` / `schedule_format is required` / `schedule_format|match_format|status không hợp lệ`.

## PATCH /api/tournament-v2/stages — sửa stage (admin)

- **Body**: `{ id*, ...field cho phép }`. Không đổi `group_id`/`tournament_id`.
- **200**: `{ "success": true, "stage": Stage }`.
- **Lỗi**: 403. 400 `Stage id is required` / validate format.

## DELETE /api/tournament-v2/stages — xóa stage (admin)

- **Query**: `?id=<id>`.
- **200**: `{ "success": true }`.
- **Lỗi**: 403. 400 `Stage id is required`.

---

## GET /api/tournament-v2/entrants — đội/cặp/cá nhân của giải (public)

- **Query**: `?tournamentId=<id>` (bắt buộc).
- **200**: `{ "entrants": Entrant[] }` (sắp `seed` asc). Mỗi entrant kèm mảng `members` đã merge.
- `Entrant`: `{ id, group_id, tournament_id, name, seed, color, members: Member[] }`.
- `Member`: `{ id, group_id, entrant_id, member_id, display_name, gender }`.
- **Lỗi**: 400 `tournamentId is required`.

## POST /api/tournament-v2/entrants — tạo entrant (admin)

- **Body**: `{ tournament_id*, name?, seed?, color?, members?: [{ member_id?, display_name?, gender? }] }`.
- **200**: `{ "success": true, "entrant": Entrant, "members": Member[] }`.
- **Lỗi**: 403. 400 `tournament_id is required`.

## PATCH /api/tournament-v2/entrants — sửa entrant (admin)

- **Body**: `{ id*, ...field, members?: [...] }`. Nếu gửi `members` (mảng) → **xóa toàn bộ members cũ rồi insert lại** (full replace). Không gửi `members` → giữ nguyên.
- **200**: `{ "success": true, "entrant": Entrant, "members"?: Member[] }` (`members` chỉ có khi body gửi mảng members).
- **Lỗi**: 403. 400 `Entrant id is required`.

## DELETE /api/tournament-v2/entrants — xóa entrant (admin)

- **Query**: `?id=<id>`.
- **200**: `{ "success": true }`.
- **Lỗi**: 403. 400 `Entrant id is required`.

---

## POST /api/tournament-v2/generate — sinh lịch cho stage (admin)

Xóa matches cũ của stage → gọi schedule engine → insert matches → resolve parent links (knockout) → đặt `stage.status='active'`.

- **Body**: `{ stageId*, seed?=1 }` (`seed` = hạt giống random của engine, để tái lập thứ tự).
- **200**: `{ "success": true, "matchCount": <number> }`.
- **Lỗi**: 403. 400 `stageId is required` / `Cần ít nhất 2 đội` / format lạ. 404 `Stage không tồn tại`.
- **Tác dụng phụ**: matches cũ bị xóa (games cascade), matches mới insert, stage → `active`.

---

## PUT /api/tournament-v2/games — nhập/sửa tỉ số 1 match (admin)

`POST` cũng map cùng handler. Replace toàn bộ games của match → gọi match engine → cập nhật `winner_entrant_id` + `status`; nếu knockout có `parent_match_id` thì đẩy winner lên match cha.

- **Body**: `{ matchId*, games: [{ game_no?, kind?='game', score_a, score_b, lineup?={} }] }` (`games` rỗng = xóa hết tỉ số).
- **200**: `{ "success": true, "complete": boolean, "winner_entrant_id": <id|null> }`.
  - `complete=true` → match `status='done'`, winner set, (knockout) winner đẩy lên cha.
  - `complete=false` → match `status='live'`, `winner_entrant_id=null`.
- **Lỗi**: 403. 400 `matchId is required` / engine lỗi (vd `kind`/điểm không hợp lệ). 404 `Match không tồn tại` / `Stage không tồn tại`.

---

## GET /api/tournament-v2/standings — tính BXH on-read (public)

Đọc public. Load entrants + games của stage → match engine resolve → schedule engine `computeStandings`. KHÔNG lưu BXH.

- **Query**: `?stageId=<id>` (bắt buộc).
- **200**: `{ "schedule_format": "round_robin"|"knockout", "standings": Row[] }`.

> **UI phải nhánh theo `schedule_format` vì shape `Row` khác nhau:**

**`round_robin` Row (13 field)**:
```json
{ "entrant_id", "played", "won", "lost", "games_won", "games_lost",
  "points_for", "points_against", "diff", "match_points",
  "group_label", "seed", "rank" }
```

**`knockout` Row (4 field)**:
```json
{ "entrant_id", "exit_round", "seed", "rank" }
```

- **Lỗi**: 400 `stageId is required` / format lạ / engine lỗi. 404 `Stage không tồn tại`.

---

## POST /api/tournament-v2/advance — chuyển stage kế (mix, admin)

Guard admin. Kiểm tra stage hiện tại đã đủ match `done` (`isStageComplete`) → `computeStandings` → `seedNextStage` → ghi seeding vào `tournament_stage_entrants` của stage kế (xóa rồi insert) → cập nhật status.

- **Body**: `{ stageId* }`.
- **200 (còn stage kế)**: `{ "success": true, "nextStageId": <id>, "advanced": <number> }`.
- **200 (đây là stage cuối)**: `{ "success": true, "final": true, "champion": SeedRow[] }`.
  - `SeedRow`: `{ entrant_id, seed_in_stage, id?, seed?, from_group?, from_rank? }` (theo output `seedNextStage`).
- **Tác dụng phụ**: `tournament_stage_entrants` stage kế bị thay bằng `{ group_id, stage_id, entrant_id, seed_in_stage }`. Stage hiện tại → `completed`; stage kế → `pending`.
- **Lỗi**: 403. 400 `stageId is required` / `Stage chưa hoàn tất` / format lạ. 404 `Stage không tồn tại`.

---

## GET /api/tournament-v2/public — snapshot công khai cho link chia sẻ/QR (public)

Đọc public theo `public_slug` (KHÔNG chặn admin). Trả snapshot read-only; realtime do UI tự subscribe Supabase trực tiếp.

> Chia sẻ link xuyên CLB nằm ngoài phạm vi v1: slug resolve trong group context của người xem, không phải group người tạo.

- **Query**: `?slug=<public_slug>` (bắt buộc).
- **200**:
```json
{
  "tournament": Tournament,
  "stages":   Stage[],     // sắp stage_order asc
  "entrants": Entrant[],   // sắp seed asc, KHÔNG kèm members (chỉ bảng entrants)
  "matches":  Match[]      // mọi match thuộc các stage; rỗng nếu chưa có stage
}
```
- `Match`: `{ id, group_id, stage_id, round, bracket_slot, entrant_a_id, entrant_b_id, winner_entrant_id, parent_match_id, status, ... }`.
- **Lỗi**: 400 `slug is required`. 404 `Giải đấu không tồn tại`. 500 Supabase lỗi.
- **Lưu ý**: `entrants` ở route này lấy thẳng từ `tournament_entrants` (chưa join `members`). Nếu UI cần members ở trang public, gọi thêm GET `entrants?tournamentId=`.
