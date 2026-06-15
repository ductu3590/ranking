# Tournament Engine API — Summary for API/UI dev

Tất cả engine là **hàm thuần CommonJS** trong `lib/tournament/`. Không I/O, không Supabase, không React.
Input là plain object, output là plain object. Deterministic; random nhận `seed`.

Aggregate test: `npm run test:t-engines` (chạy cả 10 test engine, phải kết thúc bằng 10 dòng `... ok`).

---

## 1. Registry — entry point duy nhất

`lib/tournament/engines/index.js`

```js
const { getScheduleEngine, getMatchEngine } = require('../../lib/tournament/engines');

getScheduleEngine(schedule_format) // 'round_robin' | 'knockout'  -> schedule engine
getMatchEngine(match_format)       // 'simple' | 'mlp'            -> match engine
```

- Format lạ -> **ném `Error`** (`Unknown schedule_format: ...` / `Unknown match_format: ...`). API nên try/catch hoặc validate trước.
- Schedule engine export: `generateSchedule`, `computeStandings`, `advance` (round_robin thêm `splitGroups`).
- Match engine export: `resolveMatch`.

---

## 2. Schedule engines

### Chữ ký chung
```js
engine.generateSchedule(stage, entrants, seed = 1) -> Match[]
engine.computeStandings(stage, entrants, matches) -> Row[]
engine.advance(stage, standings) -> Advanced[]
```

- `stage` = `{ schedule_format, config }`. `config` tùy thể thức (xem dưới).
- `entrants` = `[{ id, seed }]` (seed nhỏ = mạnh; thiếu seed coi như 0).
- `matches` (cho computeStandings) = các match đã sinh, **đã gắn kết quả** (xem mục ranh giới).

### 2a. round_robin (`lib/tournament/engines/roundRobin.js`)

`config`: `{ groupCount = 1, advancePerGroup = 2, winPoints = 2, lossPoints = 0, shuffle = true }`.
Số đội lẻ -> circle method tự thêm BYE ảo (không sinh match cho BYE).
`groupCount > 1` -> chia bảng kiểu rắn (snake) theo seed, mỗi bảng đá vòng tròn riêng.

**Match object do `generateSchedule` phát ra:**
```js
{
  round,            // số vòng (1-based)
  group_label,      // 'A' | 'B' | ...   (round_robin LUÔN có; knockout = null)
  bracket_slot: null,
  parent_slot: null,
  slot: null,
  entrant_a_id,     // id đội A
  entrant_b_id,     // id đội B
  order,            // thứ tự toàn cục, 0-based
}
```

**`computeStandings` row (14 trường):**
```js
{
  entrant_id,
  played, won, lost,
  games_won, games_lost,
  points_for, points_against,
  diff,             // points_for - points_against
  match_points,     // won*winPoints + lost*lossPoints
  group_label,      // gán từ match khi tính; null nếu đội chưa đá trận nào
  seed,
  rank,             // hạng TRONG bảng (1-based), reset mỗi group_label
}
```
Tie-break (giảm dần): `match_points` → `diff` → đối đầu trực tiếp (head-to-head, chỉ khi đúng 2 đội) → `points_for` → `seed` (nhỏ trước). Sort cuối cùng group trước rồi mới tie-break trong group.

**`advance(stage, standings)`** — lấy top `advancePerGroup` mỗi bảng, đan xen theo rank rồi theo nhãn bảng:
```js
[{ entrant_id, from_group, from_rank, seed_in_stage }]  // seed_in_stage 1-based
```
Thứ tự: vòng theo rank (tất cả hạng-1 mọi bảng trước, rồi hạng-2 ...), trong mỗi rank theo nhãn bảng đã sort.

### 2b. knockout (`lib/tournament/engines/knockout.js`)

`config`: không bắt buộc. Seed bằng `lib/tournament/seeding.js` (`seedOrder`, `nextPowerOfTwo`).
Số đội không phải lũy thừa 2 -> **bye ở vòng 1** (đội mạnh được vào thẳng vòng 2; match vòng 1 chỉ sinh khi cả 2 khe có đội).

**Match object do `generateSchedule` phát ra (KHÁC round_robin):**
```js
{
  round,            // 1 = vòng đầu có match
  bracket_slot,     // vị trí match trong vòng (0-based)
  parent_slot,      // slot của match kế mà NGƯỜI THẮNG đi vào (null nếu là chung kết)
  slot,             // chỉ số duy nhất TRONG stage (local, 0-based)
  group_label: null,
  entrant_a_id,     // có thể null ở vòng > 1 (chờ kết quả vòng trước)
  entrant_b_id,     // có thể null
  order,
}
```

**`computeStandings` row (KHÁC round_robin — chỉ 4 trường):**
```js
{ entrant_id, exit_round, seed, rank }
```
- `exit_round`: vòng bị loại. Vô địch = `maxRound + 1`; chưa đá/chưa loại = `0`.
- Sort: `exit_round` giảm dần → `seed` tăng. `rank` = hạng toàn giải (đồng hạng nếu cùng exit_round).
- **API/UI phải đọc standings theo format** — round_robin và knockout có shape row khác nhau hoàn toàn.

**`advance(stage, standings)`** — knockout chỉ đẩy nhà vô địch:
```js
[{ entrant_id, seed_in_stage: 1 }]   // hoặc [] nếu chưa có rank 1
```

---

## 3. Match engines — `resolveMatch(match, games, config)`

Cùng return shape cho cả simple và mlp:
```js
{ winner_entrant_id, games_a, games_b, points_a, points_b, complete }
```
- `winner_entrant_id`: `match.entrant_a_id` | `match.entrant_b_id` | `null` (khi chưa complete).
- `games_a/games_b`: số ván (simple) hoặc số sub-match (mlp) mỗi bên thắng.
- `points_a/points_b`: tổng điểm cộng dồn mọi ván/sub.
- `complete`: trận đã ngã ngũ chưa.

### 3a. simple (`lib/tournament/match/simple.js`)
`games`: `[{ score_a, score_b }]`. `config.bestOf` (mặc định 3) -> cần `floor(bestOf/2)+1` ván thắng.

### 3b. mlp (`lib/tournament/match/mlp.js`)
`games`: `[{ kind, score_a, score_b }]`. `kind === 'dreambreaker'` xử lý riêng (tie-break khi hòa sub).
`config.subMatches` (mặc định `['womens','mens','mixed1','mixed2']`) — số sub cần đá hết.
`config.dreambreaker` (mặc định true). **MLP luôn đá hết tất cả sub** (không có early clinch); hòa sub -> cần ván `dreambreaker` mới complete.

---

## 4. Orchestrator (mix đa giai đoạn) — `lib/tournament/orchestrator.js`

```js
const { isStageComplete, seedNextStage } = require('../../lib/tournament/orchestrator');

isStageComplete(matches) -> boolean   // true khi matches.length > 0 && mọi m.status === 'done'
seedNextStage(stage, standings) -> Advanced[]   // = getScheduleEngine(stage.schedule_format).advance(stage, standings)
```
Mix nhiều stage: standings stage trước → `seedNextStage` → seeding (`seed_in_stage`) cho `generateSchedule` của stage sau.

---

## 5. Ranh giới QUAN TRỌNG cho API (đọc kỹ)

(a) **slot/parent_slot là LOCAL.** `generateSchedule` phát `slot` (0-based trong stage) và `parent_slot`/`bracket_slot`.
Sau khi insert match vào DB, API phải **map `slot` → match id thật** và set `parent_match_id` từ `parent_slot`.
Engine không biết id DB.

(b) **`computeStandings` cần match `done` có đủ kết quả.** Engine giả định match `status === 'done'` đã mang
`winner_entrant_id`, `games_a/games_b`, `points_a/points_b` (round_robin). Nếu API không bảo đảm, standings sẽ ra `NaN`/sai.
Quy trình đúng: chốt match bằng `resolveMatch` → lưu các trường đó kèm `status='done'` → mới gọi `computeStandings`.

(c) **MLP không có early clinch**, luôn đá đủ sub mới complete. **Knockout không có hòa** — mỗi match phải có winner để bracket tiến tiếp.
Hòa ở knockout là edge case ngoài spec engine (đã chọn quy ước: phải có winner). Cần architect review nếu luật giải cho phép hòa.

(d) **Standings shape khác nhau theo format** (mục 2a vs 2b). UI/API phải nhánh theo `schedule_format` khi render bảng xếp hạng / lấy đội đi tiếp.
