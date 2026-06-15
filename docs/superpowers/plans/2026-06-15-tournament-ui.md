# Tournament Module — Plan 3: UI Layer (mobile-first)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Build on branch `feat/tournament-v2-foundation` (Plan 1+2 already on this branch). Implementer agent: `tournament-ui-dev`.

**Goal:** Giao diện module giải đấu: danh sách + wizard tạo giải, console quản lý (tab), nhập tỉ số (best-of-N + lineup MLP), BXH, sơ đồ knockout, trang công khai + realtime + QR. Mobile-first, tiếng Việt, fetch qua API v2.

**Architecture:** Trang/component React dưới `app/giai-dau/v2/*` (clean-slate, không đụng trang cũ tới khi deploy). Mọi data qua `app/api/tournament-v2/*` (xem `_workspace/03_api_contract.md`). Browser KHÔNG query Supabase trực tiếp trừ Realtime (public view). Role từ `getCurrentGroupClient()`.

**Tech Stack:** Next.js 14 App Router (JS), React 18, CSS file kèm component, `qrcode` (đã có), Supabase browser client CHỈ cho Realtime. Test = node contract test (component tồn tại + gọi đúng endpoint + có phần tử khóa) + verify trình duyệt cuối bằng preview tools.

---

## File Structure
- `lib/tournamentV2Client.js` — wrapper fetch trình duyệt cho mọi endpoint v2 (1 nơi, dễ test/đổi).
- `app/giai-dau/v2/page.js` (+ css) — danh sách giải + nút Tạo.
- `app/giai-dau/v2/TournamentWizard.js` (+ css) — wizard 4 bước tạo/sửa giải.
- `app/giai-dau/v2/console/TournamentConsoleV2.js` (+ css) — vỏ console + tab bar.
- `app/giai-dau/v2/console/tabs/{OverviewTab,ResultsTab,StandingsTab,BracketTab,TeamsTab,SettingsTab}.js`.
- `app/giai-dau/v2/[slug]/page.js` (+ css) — trang công khai + realtime + QR.
- Tests: `tests/tournament/ui-*.contract.test.js`.

**Convention (pickhub-engineering):** component JS + CSS kèm; mobile-first (~380px); nhãn tiếng Việt; role `getCurrentGroupClient()` ẩn nút admin với member; fetch qua client wrapper; trạng thái loading/lỗi rõ ràng (không màn trắng).

**Endpoint (từ 03_api_contract.md):** `GET/POST/PATCH/DELETE /api/tournament-v2/tournaments`; `.../stages`; `.../entrants`; `POST .../generate {stageId}`; `PUT .../games {matchId, games}`; `GET .../standings?stageId` (trả `{schedule_format, standings}`); `POST .../advance {stageId}`; `GET .../public?slug`.

---

## Task 1: Client wrapper `lib/tournamentV2Client.js`

**Files:** Create `lib/tournamentV2Client.js`, Test `tests/tournament/ui-client.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/ui-client.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'lib/tournamentV2Client.js';
assert(exists(f), 'client tồn tại');
const s = read(f);
for (const ep of ['/api/tournament-v2/tournaments', '/api/tournament-v2/stages', '/api/tournament-v2/entrants', '/api/tournament-v2/generate', '/api/tournament-v2/games', '/api/tournament-v2/standings', '/api/tournament-v2/advance', '/api/tournament-v2/public']) {
  assert(s.includes(ep), `gọi endpoint ${ep}`);
}
for (const fn of ['listTournaments', 'createTournament', 'saveStage', 'saveEntrant', 'generateSchedule', 'saveGames', 'getStandings', 'advanceStage', 'getPublic']) {
  assert(s.includes(fn), `export ${fn}`);
}
assert(s.includes("credentials") || s.includes('same-origin') || s.includes('include'), 'gửi cookie session');
console.log('ui-client contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `lib/tournamentV2Client.js`
- Một `request(path, { method, body, query })` helper: build URL với query, `fetch(url, { method, headers: {'Content-Type':'application/json'}, credentials: 'same-origin', body: body && JSON.stringify(body) })`, parse JSON, ném lỗi nếu `!res.ok` (kèm `data.error`).
- Export hàm cho mọi endpoint: `listTournaments()`, `createTournament(body)`, `updateTournament(body)`, `deleteTournament(id)`, `listStages(tournamentId)`, `saveStage(body)` (POST nếu chưa id, PATCH nếu có), `deleteStage(id)`, `listEntrants(tournamentId)`, `saveEntrant(body)`, `deleteEntrant(id)`, `generateSchedule(stageId, seed)`, `saveGames(matchId, games)`, `getStandings(stageId)`, `advanceStage(stageId)`, `getPublic(slug)`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): v2 browser API client"`

---

## Task 2: Danh sách giải + entry tạo

**Files:** Create `app/giai-dau/v2/page.js` + `app/giai-dau/v2/v2.css`, Test `tests/tournament/ui-list.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/ui-list.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/giai-dau/v2/page.js';
assert(exists(f), 'trang list tồn tại');
const s = read(f);
assert(s.includes("'use client'") || s.includes('"use client"'), 'client component');
assert(s.includes('listTournaments') && s.includes('tournamentV2Client'), 'dùng client wrapper');
assert(s.includes('getCurrentGroupClient'), 'lấy role');
assert(/Tạo|Thêm/.test(s), 'có nút tạo (tiếng Việt)');
assert(exists('app/giai-dau/v2/v2.css'), 'css kèm');
console.log('ui-list contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** trang `app/giai-dau/v2/page.js` (`'use client'`):
- `useEffect` load `listTournaments()`; state loading/error.
- Hiển thị danh sách thẻ giải (tên, ngày, trạng thái, loại entrant). Mỗi thẻ link mở console `?t=<id>`.
- Role admin (từ `getCurrentGroupClient()`): hiện nút "Tạo giải" → mở `TournamentWizard` (chế độ tạo). Member: chỉ xem.
- Khi `t` có trên URL → render `TournamentConsoleV2` thay vì list.
- Mobile-first, nhãn tiếng Việt, trạng thái loading/lỗi rõ.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): v2 tournament list page"`

---

## Task 3: Wizard tạo/sửa giải (4 bước)

**Files:** Create `app/giai-dau/v2/TournamentWizard.js` (+ css dùng chung v2.css), Test `tests/tournament/ui-wizard.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/ui-wizard.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/giai-dau/v2/TournamentWizard.js';
assert(exists(f), 'wizard tồn tại');
const s = read(f);
assert(s.includes('createTournament') && s.includes('saveStage') && s.includes('saveEntrant') && s.includes('generateSchedule'), 'gọi 4 bước API');
for (const t of ['pair', 'team', 'round_robin', 'knockout', 'simple', 'mlp']) assert(s.includes(t), `tùy chọn ${t}`);
for (const label of ['Thông tin', 'Giai đoạn', 'Đội', 'lịch']) assert(s.includes(label), `bước "${label}"`);
console.log('ui-wizard contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `TournamentWizard.js` (`'use client'`), 4 bước state máy:
- **Bước 1 Thông tin:** form tên, ngày, địa điểm, `entrant_type` (radio: Cặp đôi `pair` / Đội `team`). Lưu → `createTournament` (hoặc `updateTournament` nếu sửa) → giữ `tournamentId`.
- **Bước 2 Giai đoạn:** danh sách stage; thêm stage: chọn `schedule_format` (Vòng tròn `round_robin` / Loại trực tiếp `knockout`) + `match_format` (Thường `simple` / MLP `mlp`) + config (số bảng `groupCount`, suất đi tiếp `advancePerGroup`, bestOf). Mix = thêm ≥2 stage. Lưu mỗi stage `saveStage`.
- **Bước 3 Đội/Cặp:** thêm entrant (tên + chọn member CLB từ `club_members` qua `/api/club/members` nếu có, hoặc gõ tên + giới tính cho MLP) → `saveEntrant`. Kéo/đặt `seed` (số thứ tự). Tối thiểu 2 entrant.
- **Bước 4 Sinh lịch:** chọn stage đầu → `generateSchedule(stageId)` → báo số trận → chuyển vào console.
- Nút Tiếp/Lùi, validate mỗi bước, loading/lỗi.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): v2 create wizard (4 steps)"`

---

## Task 4: Console shell + tab bar

**Files:** Create `app/giai-dau/v2/console/TournamentConsoleV2.js` (+ console.css), Test `tests/tournament/ui-console.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/ui-console.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/giai-dau/v2/console/TournamentConsoleV2.js';
assert(exists(f), 'console tồn tại');
const s = read(f);
for (const t of ['Tổng quan', 'Kết quả', 'Bảng xếp hạng', 'Sơ đồ', 'Đội', 'Cài đặt']) assert(s.includes(t), `tab "${t}"`);
for (const c of ['OverviewTab', 'ResultsTab', 'StandingsTab', 'BracketTab', 'TeamsTab', 'SettingsTab']) assert(s.includes(c), `render ${c}`);
console.log('ui-console contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `TournamentConsoleV2.js` (`'use client'`):
- Props: `tournamentId`. Load tournament + stages (`listStages`). State `activeTab` (đọc/ghi `?tab=` URL), `activeStageId`.
- Tab bar cuộn ngang (mobile): Tổng quan · Kết quả · Bảng xếp hạng · Sơ đồ · Đội · Cài đặt. Render tab tương ứng, truyền `tournamentId`, `stageId`, `stages`.
- Chọn stage (nếu mix nhiều stage): dropdown/segmented ở đầu console.
- Stub 6 tab component (mỗi file tạo tối thiểu ở task này hoặc task sau). Để task này pass, tạo các file tab rỗng/đơn giản import được.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): v2 console shell + tabs"`

---

## Task 5: Tab Kết quả (nhập tỉ số + lineup MLP) + Overview + Teams + Settings

**Files:** Create `app/giai-dau/v2/console/tabs/{ResultsTab,OverviewTab,TeamsTab,SettingsTab}.js`, Test `tests/tournament/ui-results.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/ui-results.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const rt = 'app/giai-dau/v2/console/tabs/ResultsTab.js';
assert(exists(rt), 'ResultsTab tồn tại');
const s = read(rt);
assert(s.includes('saveGames'), 'lưu tỉ số qua saveGames');
assert(/score_a|score_b/.test(s), 'nhập điểm từng ván');
assert(s.includes('womens') || s.includes('mlp') || s.includes('lineup'), 'hỗ trợ lineup/ván con MLP');
assert(exists('app/giai-dau/v2/console/tabs/SettingsTab.js'), 'SettingsTab tồn tại');
const st = read('app/giai-dau/v2/console/tabs/SettingsTab.js');
assert(st.includes('public') || st.includes('slug') || st.includes('QR') || st.includes('qrcode'), 'Settings có link/QR công khai');
console.log('ui-results contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
- **ResultsTab:** load matches của stage (qua một endpoint đọc — dùng `getPublic` lọc theo stage HOẶC thêm tham số; nếu chưa có endpoint match-list riêng, dùng dữ liệu console truyền xuống). Mỗi trận: hiện 2 entrant + ô nhập tỉ số từng ván (`score_a`/`score_b`); với `match_format='mlp'`: nhập 4 ván con (womens/mens/mixed1/mixed2) + dreambreaker khi hòa + chọn lineup (ai đánh). Nút Lưu → `saveGames(matchId, games)`; cập nhật trạng thái trận.
- **OverviewTab:** tóm tắt giải (tên, trạng thái, số stage/đội, tiến độ trận done/total); nút "Chuyển giai đoạn" (admin) → `advanceStage(stageId)`.
- **TeamsTab:** danh sách entrant + members (load `listEntrants`); admin sửa/xóa.
- **SettingsTab:** hiện link công khai `/giai-dau/v2/<slug>` + QR (dùng `qrcode` tạo dataURL); nút reset/regenerate lịch (admin).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): v2 results/overview/teams/settings tabs"`

> **Lưu ý:** ResultsTab cần danh sách trận của stage. Nếu API v2 chưa có endpoint trả matches theo stage cho admin, thêm `GET /api/tournament-v2/matches?stageId=` (group-scoped, đọc qua getEffectiveGroupContext) — task này được phép tạo endpoint nhỏ đó kèm contract test. Giữ đúng convention.

---

## Task 6: Tab Bảng xếp hạng + Sơ đồ (bracket)

**Files:** Create `app/giai-dau/v2/console/tabs/{StandingsTab,BracketTab}.js` (+ bracket.css), Test `tests/tournament/ui-standings.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/ui-standings.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const ss = 'app/giai-dau/v2/console/tabs/StandingsTab.js';
assert(exists(ss), 'StandingsTab tồn tại');
const s = read(ss);
assert(s.includes('getStandings'), 'gọi getStandings');
assert(s.includes('schedule_format'), 'nhánh theo schedule_format');
assert(/round_robin|match_points|exit_round|knockout/.test(s), 'render 2 shape BXH');
assert(exists('app/giai-dau/v2/console/tabs/BracketTab.js'), 'BracketTab tồn tại');
console.log('ui-standings contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
- **StandingsTab:** `getStandings(stageId)` → `{schedule_format, standings}`. Nếu `round_robin`: bảng cột Hạng/Đội/Trận/Thắng/Thua/Hiệu số/Điểm (13 trường), nhóm theo `group_label`. Nếu `knockout`: danh sách hạng (`exit_round`→nhãn: Vô địch/Á quân/…). Mobile: bảng cuộn ngang.
- **BracketTab:** chỉ khi stage `schedule_format='knockout'`. Vẽ cây từ matches (round + bracket_slot + parent): cột theo vòng, scroll ngang trên mobile; ô trận hiện 2 entrant + tỉ số + đánh dấu winner; bye hiển thị rõ.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): v2 standings + bracket tabs"`

---

## Task 7: Trang công khai + realtime + QR

**Files:** Create `app/giai-dau/v2/[slug]/page.js` (+ public.css), Test `tests/tournament/ui-public.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/ui-public.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/giai-dau/v2/[slug]/page.js';
assert(exists(f), 'trang công khai tồn tại');
const s = read(f);
assert(s.includes('getPublic') || s.includes('/api/tournament-v2/public'), 'load dữ liệu công khai');
assert(s.includes('supabaseClient') || s.includes('.channel(') || s.includes('postgres_changes'), 'realtime subscribe');
assert(s.includes('getStandings') || s.includes('standings'), 'hiện BXH');
console.log('ui-public contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `app/giai-dau/v2/[slug]/page.js` (`'use client'`):
- Lấy `slug` từ params → `getPublic(slug)` → tournament + stages + entrants + matches.
- Chỉ xem (read-only): lịch đấu, BXH (gọi `getStandings` mỗi stage, nhánh theo format), sơ đồ knockout (tái dùng logic BracketTab). Tab/bước theo stage.
- **Realtime:** `supabaseClient.channel('tour-<id>').on('postgres_changes', {event:'*', schema:'public', table:'tournament_matches', filter:'stage_id=in...'}, reload).subscribe()` (và `tournament_games`). Khi có thay đổi → refetch public + standings. Cleanup khi unmount.
- Không hiện nút admin (đây là view công khai).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): v2 public view + realtime + QR"`

---

## Task 8: Đăng ký test + QA + verify trình duyệt

**Files:** Modify `package.json`; verify.

- [ ] **Step 1:** Thêm script `package.json`: `"test:t-ui": "node tests/tournament/ui-client.contract.test.js && node tests/tournament/ui-list.contract.test.js && node tests/tournament/ui-wizard.contract.test.js && node tests/tournament/ui-console.contract.test.js && node tests/tournament/ui-results.contract.test.js && node tests/tournament/ui-standings.contract.test.js && node tests/tournament/ui-public.contract.test.js"`.
- [ ] **Step 2:** Chạy `npm run test:t-engines && npm run test:t-api && npm run test:t-ui && npm run test:t-migration` → tất cả xanh.
- [ ] **Step 3: QA tích hợp (tournament-qa):** so khớp UI ↔ `_workspace/03_api_contract.md`: mỗi component gọi đúng endpoint + đọc đúng field (vd StandingsTab nhánh `schedule_format`, ResultsTab gửi `games` đúng shape, public realtime đúng bảng). Ghi `_workspace/04_ui_map.md`.
- [ ] **Step 4: Verify trình duyệt (BẮT BUỘC, chỉ khi migration 015 đã áp DB):** vì cần bảng v2 thật. Nếu DB chưa áp migration → GHI CHÚ là chưa verify end-to-end được, liệt kê bước verify thủ công cho sau khi deploy. Nếu đã áp: `preview_start`, mở `/giai-dau/v2`, tạo 1 giải vòng tròn 4 đội qua wizard, sinh lịch, nhập vài tỉ số, xem BXH + sơ đồ + trang công khai; chụp `preview_screenshot` làm bằng chứng. Sửa lỗi nếu có.
- [ ] **Step 5: Commit** `git commit -m "chore(tournament): UI test aggregate + QA map"`

---

## Self-Review
- **Spec coverage (§6):** list+wizard (Task 2,3), console+tabs (4,5,6), public+realtime+QR (7). ✅
- **Type consistency:** client wrapper (Task 1) là 1 nguồn endpoint; mọi component gọi qua nó; StandingsTab/public nhánh theo `schedule_format` đúng 2 shape; ResultsTab gửi `games:[{game_no,kind,score_a,score_b,lineup}]` khớp games route.
- **Ranh giới:** UI không query Supabase trừ Realtime (public). Cần endpoint matches-by-stage cho ResultsTab → tạo ở Task 5 nếu thiếu.
- **Verify thật:** browser verify phụ thuộc migration 015 đã áp (Task 8 Step 4) — nếu chưa áp, verify hoãn tới sau deploy, ghi rõ.

## Ngoài phạm vi
Tự động bốc thăm/seed, double elimination, lịch theo sân/giờ, thống kê xuyên giải, chia sẻ public xuyên CLB.
