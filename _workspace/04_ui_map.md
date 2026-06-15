# Tournament UI Map (v2) — for the record

Mọi component UI v2 gọi API qua `@/lib/tournamentV2Client` (ngoại lệ duy nhất: trang công khai dùng `@/lib/supabaseClient` cho Realtime channel — không truy vấn dữ liệu). Role lấy từ `getCurrentGroupClient().role` (`localStorage` `teamfund-current-group`, mặc định `member`).

## Client wrapper — `lib/tournamentV2Client.js`

| Hàm | Method + path | Trả về |
|-----|---------------|--------|
| `listTournaments()` | GET /tournaments | `tournaments[]` |
| `createTournament(body)` | POST /tournaments | `{success, tournament}` |
| `updateTournament(body)` | PATCH /tournaments | `{success, tournament}` |
| `deleteTournament(id)` | DELETE /tournaments?id | `{success}` |
| `listStages(tournamentId)` | GET /stages?tournamentId | `stages[]` |
| `saveStage(body)` | POST (no id) / PATCH (id) /stages | `{success, stage}` |
| `deleteStage(id)` | DELETE /stages?id | `{success}` |
| `listEntrants(tournamentId)` | GET /entrants?tournamentId | `entrants[]` (kèm `members`) |
| `saveEntrant(body)` | POST / PATCH /entrants | `{success, entrant, members?}` |
| `deleteEntrant(id)` | DELETE /entrants?id | `{success}` |
| `generateSchedule(stageId, seed=1)` | POST /generate | `{success, matchCount}` |
| `listMatches(stageId)` | GET /matches?stageId | `{matches, gamesByMatchId}` |
| `saveGames(matchId, games)` | PUT /games | `{success, complete, winner_entrant_id}` |
| `getStandings(stageId)` | GET /standings?stageId | `{schedule_format, standings}` |
| `advanceStage(stageId)` | POST /advance | `{success, nextStageId, advanced}` hoặc `{success, final, champion}` |
| `getPublic(slug)` | GET /public?slug | `{tournament, stages, entrants, matches}` |

## Routes & components

### `/giai-dau/v2` — `app/giai-dau/v2/page.js`
- Hub theo query: không `?t` → danh sách giải; `?t=<id>` → console; `creating` state → wizard.
- Đọc: `listTournaments()`. Role: `getCurrentGroupClient().role === 'admin'` gate nút "+ Tạo giải".
- Bao trong `<Suspense>` vì dùng `useSearchParams` (Next 14 App Router).

### Wizard — `app/giai-dau/v2/TournamentWizard.js` (admin-only surface, mở từ nút tạo)
- 4 bước: thông tin → giai đoạn → đội/cặp → sinh lịch.
- Calls: `createTournament`/`updateTournament` (B1), `saveStage` (B2, gửi `config={groupCount,advancePerGroup,bestOf}`), `saveEntrant` (B3), `generateSchedule(stages[0].id)` (B4).
- Sinh lịch chỉ cho **stage đầu tiên**; stage sau sinh ở Settings/advance.

### Console — `app/giai-dau/v2/console/TournamentConsoleV2.js`
- Load: `listTournaments()` (lấy 1 giải theo id) + `listStages(tournamentId)` song song.
- Tab điều khiển bằng `?tab=`; stage picker khi `stages.length > 1`.
- Truyền xuống mọi tab: `{tournamentId, tournament, stageId, stage, stages, isAdmin, reload}`.

#### Tabs
| Tab | File | Render | Calls | Admin actions |
|-----|------|--------|-------|---------------|
| Tổng quan | OverviewTab.js | thống kê stage/đội, progress trận, trạng thái | `listEntrants`, `listMatches(stageId)`, `advanceStage` | "Chuyển giai đoạn kế tiếp" (gate `isAdmin && stage`) |
| Kết quả | ResultsTab.js | mỗi match 1 card nhập tỉ số | `listMatches(stageId)` → `{matches, gamesByMatchId}`, `listEntrants`, `saveGames` | nhập/lưu tỉ số, +/- ván (gate `isAdmin`; input `disabled={!isAdmin}`) |
| Bảng xếp hạng | StandingsTab.js + standingsRender.js | nhánh theo `schedule_format` | `getStandings(stageId)`, `listEntrants` | read-only |
| Sơ đồ | BracketTab.js + bracketRender.js | cây knockout | `listMatches(stageId)`, `listEntrants` | read-only |
| Đội | TeamsTab.js | danh sách entrant + members | `listEntrants`, `saveEntrant`, `deleteEntrant` | thêm/sửa/xóa (gate `isAdmin`) |
| Cài đặt | SettingsTab.js | link công khai + QR, sinh lại lịch | `generateSchedule` | "Sinh lại" mỗi stage (gate `isAdmin`); QR/link công khai (mọi role) |

### Public — `app/giai-dau/v2/[slug]/page.js`
- Đọc: `getPublic(slug)` (snapshot) + `getStandings(stage.id)` cho từng stage.
- Realtime: channel `tour-public-<tournamentId>` trên `tournament_matches` + `tournament_games`, debounce 600ms → `load()`; cleanup `removeChannel` + clear timer khi unmount/đổi id.
- Lọc `matches` theo `stage_id` ở client. Render: ScheduleList + StandingsView (+ BracketView nếu knockout).
- **Read-only tuyệt đối**: không gọi hàm mutating, không nút admin.

## Standings divergence (UI/qa bắt buộc nhánh theo `schedule_format`)

`standingsRender.js#StandingsView` rẽ nhánh:
- **round_robin** → `RoundRobinStandings`: gom theo `group_label`, mỗi bảng 1 table; cột rank/đội/trận(`played`)/T(`won`)/B(`lost`)/hiệu số(`diff`)/điểm(`match_points`). Sắp theo `rank`.
- **knockout** → `KnockoutStandings`: list placement, `koLabel(exit_round, maxExit)` map độ sâu → Vô địch / Á quân / Bán kết / Tứ kết. Sắp theo `rank`.
- Cả 2 resolve `entrant_id` → tên qua `entrantsById` (`listEntrants`); thiếu tên hiển thị `#id`.

## Bracket (knockout-only)

`bracketRender.js#BracketView`: gom theo `round`, sắp `bracket_slot`; `roundLabel(round, maxRound)` → Chung kết/Bán kết/Tứ kết; xử lý null entrant (BYE nếu 1 bên null + bên kia có đội, ngược lại "chờ"); winner highlight theo `winner_entrant_id`. `parent_match_id` được engine/API dùng để đẩy winner; UI chỉ đọc cây đã resolve. `matchScore(games)` đếm ván thắng để hiển thị tỉ số tổng.

## Bề mặt admin vs công khai

- **Admin-only mutations** (đều gate `isAdmin`, route cũng `requireGroupAdmin()` ⇒ 403): tạo/sửa giải (Wizard), saveStage, saveEntrant/deleteEntrant (Teams), saveGames (Results), generateSchedule (Settings/Wizard), advanceStage (Overview).
- **Member**: đọc mọi tab, không thấy nút mutate (input tỉ số `disabled`).
- **Public page**: chỉ đọc + Realtime; không phụ thuộc role.

## Giới hạn đã biết (known limitation)

- **Public bracket hiện winner nhưng KHÔNG có tỉ số per-game.** `GET /public` trả `matches[]` nhưng KHÔNG kèm `gamesByMatchId`; trang công khai gọi `BracketView(..., gamesByMatchId={}, ...)` ⇒ `matchScore` luôn `null` ⇒ không hiện số ván thắng trên sơ đồ công khai. Sơ đồ trong console (BracketTab dùng `listMatches`) có tỉ số. Muốn public có tỉ số: hoặc thêm games map vào `/public`, hoặc gọi `listMatches` per-stage ở trang công khai.
- **Public entrants chưa join `members`** (theo contract `/public`). UI công khai chỉ cần `name` cho ScheduleList/Standings/Bracket nên không ảnh hưởng; nếu cần members phải gọi thêm `GET /entrants?tournamentId=`.
</content>
</invoke>
