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
| `getPairs(stageId)` | GET /pairs?stageId | `{pairSchedule\|null}` (MLP lịch ghép đôi nội bộ đội) |
| `generatePairs(stageId, seed=1)` | POST /pairs | `{success, pairSchedule}` (admin; idempotent ghi đè) |
| `listMatches(stageId)` | GET /matches?stageId | `{matches, gamesByMatchId}` (games kèm `lineup` snapshot nếu có) |
| `saveGames(matchId, games)` | PUT /games | `{success, complete, winner_entrant_id}` |
| `getStandings(stageId)` | GET /standings?stageId | `{schedule_format, standings}` |
| `advanceStage(stageId)` | POST /advance | `{success, nextStageId, advanced}` hoặc `{success, final, champion}` |
| `getPublic(slug)` | GET /public?slug | `{tournament, stages, entrants, matches}` |

## Routes & components

### `/giai-dau/v2` — `app/giai-dau/v2/page.js`
- Hub theo query: không `?t` → danh sách giải; `?t=<id>` → console; `creating` state → wizard.
- Đọc: `listTournaments()`. Role: `getCurrentGroupClient().role === 'admin'` gate nút "+ Tạo giải".
- Bao trong `<Suspense>` vì dùng `useSearchParams` (Next 14 App Router).

### Wizard tạo giải — `app/giai-dau/v2/TournamentWizard.js` (admin-only, mở từ nút "+ Tạo giải")
- **Luồng 3 bước** (redesign, port từ mockup đã duyệt): **Thể thức** · **Thông tin giải** · **Đăng ký**. Stepper số + connector, bấm nhảy bước tự do. Chân trang: Quay lại / "Bước x / 3" / Tiếp tục → / Tạo giải. Khung rộng `.w3-create` (max 1440px, min-height ~viewport), mobile-first ~380px.
- **Quyền**: `useEffect` fetch `/api/groups/session` → `{ id, code, name, role }` từ `session.group_id/group_code/group_name/role`. Không phải admin → chỉ hiện thông báo "Chỉ trưởng nhóm/BTC…". KHÔNG đọc role từ localStorage.
- **Bước 1 — Thể thức** (hai pane `.w3-work`: cấu hình trái `.w3-setup` + Xem trước sống phải `.w3-preview-pane`; mobile có tab `.w3-mtabs` Cấu hình/Xem trước, desktop ≥880px hiện cả hai):
  - Phạm vi (`.w3-seg`): Nội bộ CLB / Giao hữu (mời CLB) / Cộng đồng 🔒 (khoá `disabled`). Đổi phạm vi áp `defaultConfigForScope` (giao hữu/cộng đồng → `userScoring='club'`).
  - Đơn vị vào sân (3 thẻ `.w3-selcard`): Cá nhân/Cặp đôi/Đội (MLP). Chọn Đội → ẩn "Tính thành tích", set `userScoring='individual'`.
  - Tính thành tích (2 thẻ) — CHỈ hiện khi `scope!=='internal' && unit!=='team'`.
  - Thể thức (4 thẻ): Vòng tròn / Loại trực tiếp 1 nhánh / Loại trực tiếp 2 nhánh (badge "engine đang xây") / Vòng bảng + CK.
  - Số ván (`.w3-seg` 1/BO3/BO5) khi `unit!=='team'`; hoặc Cấu hình trận đội (`.w3-stepcnt` số người mỗi đội, số ván con) khi `unit==='team'`.
  - Dòng diễn giải combo dùng `describeCombo` (`.w3-cross`).
  - **Xem trước sống** (`LivePreview`): mỗi khi cấu hình đổi → `previewSchedule({ competition: resolveCompetition(cfg), entrant_count, seed:1 })`. Render: rr → danh sách trận (6 đầu + "+X trận"); se/de → sơ đồ `.w3-bracket` (de vẽ thêm "Nhánh thua"); mix → cột Bảng A/B + Playoff. `entrant_count` = số người/cặp/đội/CLB đang có, hoặc ước lượng 6. Có trạng thái loading/error rõ ràng.
- **Bước 2 — Thông tin giải**: Tên giải; Link chia sẻ (`.w3-urlrow` prefix `pickhub.vn/giai/` + slug auto qua `slugify` bỏ dấu tiếng Việt/đ→d, sửa được); Mô tả (textarea); Poster (`.w3-banner` placeholder).
- **Bước 3 — Đăng ký** (`RegisterStep`, rẽ theo phạm vi):
  - Nội bộ đơn/đôi: chips người chơi (thêm Enter/dán/xoá, "chọn nhanh từ thành viên CLB"), ghép cặp `.w3-pairs` (chạm 2 người đổi chỗ `tapMember`, "⚁ Ghép ngẫu nhiên"). PHR mẫu `samplePhr()` chỉ minh hoạ.
  - Nội bộ đội: bộ chia đội `.w3-teams` (± số đội, "⚁ Chia ngẫu nhiên").
  - Giao hữu: "Hạn nộp danh sách"; "CLB được mời" `.w3-clubs` với trạng thái + nút Duyệt/Yêu cầu sửa (nối `updateTournamentClub` khi club có id thật; CLB mẫu chỉ đổi trạng thái hiển thị).
  - Cộng đồng: block "Link đăng ký" (copy), "Hạn đăng ký", ai được đăng ký, hàng chờ duyệt. Ghi chú đây là thiết lập; mặt công khai thuộc spec khác. (Cộng đồng khoá ở bước 1 nên không chọn được; nhánh render giữ để dùng khi có community admin.)
- **"Tạo giải"** (`createGiai`): `createTournament` → auto `inviteTournamentClub(host)` → `saveDivision` (play_type từ `UNIT_TO_PLAY`, scoring_scope từ `resolveCompetition`) → `saveStage` (schedule_format từ resolve, match_format `mlp`/`simple`) → nội bộ: `saveDivisionEntry` mỗi suất (người/cặp/đội) gắn `tournament_club_id` host; giao hữu: `inviteExternalClub` cho CLB ngoài. Mỗi bước phụ bọc try/catch riêng để lỗi lẻ không chặn tạo giải; xong gọi `onDone(tournamentId)` mở console. Toast "✓ Đã tạo giải".
- **Dữ liệu mẫu (chưa nối API thật)**: danh sách người chơi khởi tạo, `clubPool` chọn nhanh, `inviteClubs`/`regClubs`, PHR hiển thị. Roster thành viên CLB thật + CLB PickHub trong danh sách mời sẽ nối ở console/bước sau.
- Import config: `resolveCompetition, describeCombo, effectiveScoring, defaultConfigForScope` từ `@/lib/tournament/wizardConfig`.

### Console — `app/giai-dau/v2/console/TournamentConsoleV2.js`
- Load: `listTournaments()` (lấy 1 giải theo id) + `listStages(tournamentId)` song song.
- Tab điều khiển bằng `?tab=`; stage picker khi `stages.length > 1`.
- Truyền xuống mọi tab: `{tournamentId, tournament, stageId, stage, stages, isAdmin, reload}`.

#### Tabs
| Tab | File | Render | Calls | Admin actions |
|-----|------|--------|-------|---------------|
| Tổng quan | OverviewTab.js | thống kê stage/đội, progress trận, trạng thái | `listEntrants`, `listMatches(stageId)`, `advanceStage` | "Chuyển giai đoạn kế tiếp" (gate `isAdmin && stage`) |
| Kết quả | ResultsTab.js | mỗi match 1 card nhập tỉ số; MLP hiện đôi mỗi ván con + DreamBreaker | `listMatches(stageId)`, `listEntrants`, `saveGames`, `getPairs` (MLP), `generatePairs` (MLP admin) | nhập/lưu tỉ số, +/- ván, sinh lại cặp đôi, chọn VĐV DreamBreaker (gate `isAdmin`) |
| Bảng xếp hạng | StandingsTab.js + standingsRender.js | nhánh theo `schedule_format` | `getStandings(stageId)`, `listEntrants` | read-only |
| Sơ đồ | BracketTab.js + bracketRender.js | cây knockout | `listMatches(stageId)`, `listEntrants` | read-only |
| Đội | TeamsTab.js | danh sách entrant + members | `listEntrants`, `saveEntrant`, `deleteEntrant` | thêm/sửa/xóa (gate `isAdmin`) |
| Cài đặt | SettingsTab.js | link công khai + QR, sinh lại lịch | `generateSchedule` | "Sinh lại" mỗi stage (gate `isAdmin`); QR/link công khai (mọi role) |

### Public — `app/giai-dau/v2/[slug]/page.js`
- Đọc: `getPublic(slug)` (snapshot) + `getStandings(stage.id)` cho từng stage.
- Realtime: channel `tour-public-<tournamentId>` trên `tournament_matches` + `tournament_games`, debounce 600ms → `load()`; cleanup `removeChannel` + clear timer khi unmount/đổi id.
- Lọc `matches` theo `stage_id` ở client. Render: ScheduleList + StandingsView (+ BracketView nếu knockout).
- **Read-only tuyệt đối**: không gọi hàm mutating, không nút admin.

### Phase 4 — Operations — `app/giai-dau/v2/operations/page.js`
- Query: `?t=<tournamentId>&stage=<stageId>`; role lấy từ `getCurrentGroupClient()`.
- Gọi qua client wrapper: `getOperationsDashboard`, `getCourtBoard`, `listMatches`, `listEntrants`, `updateCheckIn`, `createScoreCorrection`.
- Dashboard hiển thị tóm tắt trận, check-in và bảng sân cuộn ngang trên mobile. Admin mới thấy nút check-in và "Yêu cầu sửa"; correction bắt buộc lý do và gửi qua `/operations/corrections` để server audit.
- Hợp đồng route operations: GET `/operations/dashboard?tournamentId&stageId`, GET `/operations/court-board?tournamentId&stageId`, POST `/operations/check-in` (`tournament_id`, `stage_id`, `entrant_id`, `status`), GET/POST `/operations/corrections` (POST nhận `match_id`, `games`, `reason`, `idempotency_key`).

## MLP pairs & lineup trong ResultsTab (qa bắt buộc kiểm)

- **Load**: stage MLP → `load()` gọi thêm `getPairs(stageId)` (fail-soft `.catch(()=>null)`), lưu `pairSchedule`. Non-MLP không gọi.
- **Đôi mỗi ván con**: mỗi row MLP (womens/mens/mixed1/mixed2, round `r = game_no-1`) hiển thị `.v2-lineup-display` "Tên + Tên vs Tên + Tên". Nguồn: ưu tiên `game.lineup` snapshot đã lưu; nếu chưa có lấy `proposedPair(pairSchedule, entrantId, r, 0)`. Không có pairSchedule → không hiện đôi (chỉ nhãn ván con).
- **Gửi lineup khi lưu**: `save()` đính `lineup={round, pairIndex:0, a, b}` vào mỗi game con (snapshot từ saved hoặc đề xuất). DreamBreaker game đính `lineup={dreamBreaker:true, a:dbPickA, b:dbPickB}`. Không pairSchedule + không chọn người ⇒ `lineup` bị bỏ (API nhận optional).
- **DreamBreaker UI**: hiện khối `.v2-dreambreaker-section` khi đã chấm đủ `MLP_SUBS.length` ván con mà số ván thắng hòa (`subWinsA===subWinsB`), hoặc đã có điểm DreamBreaker. Admin multi-select VĐV mỗi đội (từ `entrant.members`, ref `{mi, name}`), nhập điểm. Member chỉ xem đôi đã chốt + điểm.
- **Sinh lại cặp đôi** (admin, stage MLP): nút `.v2-pairs-bar` gọi `generatePairs(stageId, randomSeed)` → cập nhật `pairSchedule` (chỉ ĐỀ XUẤT; game đã lưu giữ `lineup` snapshot gốc). Cảnh báo hiển thị inline.
- `mi` = index VĐV trong `entrant.members` (entrants theo seed asc, members theo id asc ở API pairs) — trùng thứ tự `listEntrants` trả `members`.

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
