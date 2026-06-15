# Thiết kế lại trang quản lý giải đấu (Admin Tournament)

- Ngày: 2026-06-14
- Trạng thái: Đã duyệt phương án, chờ duyệt spec
- Phạm vi: UI + backend (gắn dữ liệu vận hành theo từng `tournament_id`)
- URL hiện tại: `/admin?section=tournament`

## 1. Vấn đề

Trang `/admin?section=tournament` hiện gộp 6 khối không liên quan vào một trang cuộn dài, và trộn **hai mô hình dữ liệu** khác nhau:

1. **Danh sách nhiều giải** — bảng `tournaments` (name, format, team_size...), có CRUD đầy đủ.
2. **Console một giải singleton** — `tournament_settings` (1 dòng/CLB) + `tournament_teams` / `tournament_players` / `tournament_matches` / `tournament_pairings` chỉ lọc theo `group_id`, luôn thao tác trên "giải mặc định" bất kể người dùng chọn giải nào trong danh sách.

Hệ quả:
- Có **hai form tên/ngày giải** chồng nhau (form tạo giải ở danh sách + "Cài Đặt Giải Đấu").
- Trên mobile là một trang cuộn rất dài, không phân cấp.
- Không thật sự quản lý được nhiều giải: mọi cài đặt/đội/trận đều dồn về một giải.

Tin tốt: **các bảng vận hành đã có sẵn cột `tournament_id`** (mặc định `1`) — migration `004_tournament_tables.sql`. Việc "mỗi giải có dữ liệu riêng" chủ yếu là *luồn `tournament_id` qua API + dựng lại UI*, không phải migration schema lớn.

## 2. Mục tiêu

- Mobile-first (admin chủ yếu dùng điện thoại; đã có `MobileBottomNav`).
- Quản lý **nhiều giải, nhiều thể thức** thật sự — mỗi giải sở hữu settings/đội/pairings/trận riêng.
- Xóa sự trộn lẫn singleton vs multi-tournament; bỏ form tên/ngày trùng lặp.
- Phân cấp rõ: chọn 1 giải → vào console của giải đó.

Ngoài phạm vi (KHÔNG làm lần này):
- Không đổi thuật toán chia cặp/đội (`auto-assign` giữ nguyên logic, chỉ nhận `tournamentId`).
- Không làm lại trang public `/giai-dau/.../live` về mặt giao diện (chỉ chỉnh API để lọc đúng giải khi cần).
- Không thêm RBAC/role mới ngoài check admin sẵn có.

## 3. Phương án đã duyệt: A — List → Console (master-detail, có tab)

### 3.1 Màn 1 — Danh sách giải đấu
- Header: tiêu đề "Giải đấu" + nút **Tạo**.
- Filter chips theo trạng thái: Tất cả · Đang diễn ra · Nháp · Hoàn thành.
- Mỗi giải là 1 card bấm được (chevron): status pill, tên, `format · team_size · tiến độ trận`, ngày/địa điểm.
- Bấm card → vào console của giải đó. Nút Tạo → form tạo (toàn màn).

### 3.2 Màn 2 — Console của 1 giải
- Header: nút back + tên giải + status pill + menu `⋮` (overflow: Sửa thông tin, Reset giải, Xem Live, Xóa).
- Strip "Bước tiếp theo" (gợi ý hành động theo trạng thái) với 1 CTA — ví dụ "Công bố Round 1".
- Tab bar cuộn ngang: **Tổng quan · Cài đặt · Đội & VĐV · Pairings · Trận đấu**.

### 3.3 Ánh xạ khối cũ → mới

| Khối hiện tại | Vị trí mới |
|---|---|
| Danh sách giải + form tạo | Màn 1 + form tạo/sửa toàn màn |
| Stats grid (4 thẻ) | Console → Tổng quan |
| "Cài Đặt Giải Đấu" (singleton) | Console → Cài đặt (gộp, bỏ trùng tên/ngày; courts/giờ/reveal-time theo từng giải) |
| Teams overview | Console → Đội & VĐV (+ nút "Chia team/cặp ngẫu nhiên" tại đây) |
| Pairings (subtab riêng hôm nay) | Console → Pairings |
| Matches summary | Console → Trận đấu |
| Quick Actions (reveal/reset/refresh) | Strip "Bước tiếp theo" + menu `⋮` |

### 3.4 Vì sao chọn A (so với B/C)
- **B (1 trang + dropdown + accordion):** thay đổi nhỏ hơn nhưng vẫn là trang dài, selector dễ bị bỏ sót, không tách bạch dữ liệu từng giải.
- **C (wizard theo vòng đời):** tốt cho lần đầu nhưng vướng khi sửa giải đã có.
- **A** tách bạch theo giải, hợp mobile (mỗi lúc một việc), mở rộng tốt cho nhiều giải/thể thức. Đã mượn ý "Bước tiếp theo" của C để hướng dẫn thao tác.

## 4. Điều hướng & URL

Mở rộng query param hiện có, không tạo route mới:

- Danh sách: `/admin?section=tournament`
- Console: `/admin?section=tournament&t=<id>&tab=overview|settings|teams|pairings|matches`
- Tạo mới: `/admin?section=tournament&action=create`
- Sửa thông tin: `/admin?section=tournament&t=<id>&action=edit`

Quy ước: có `t=<id>` → render Console; không có → render Danh sách. `tab` mặc định `overview`. Giữ tương thích link cũ `view=pairings` bằng cách map sang `tab=pairings` (nếu có `t`).

## 5. Thay đổi Frontend

Tách `AdminTournamentPanel` (hiện 681 dòng, làm mọi thứ) thành các đơn vị tập trung:

- `TournamentListView` — danh sách + filter chips + điều hướng vào console.
- `TournamentForm` — form tạo/sửa metadata giải (tên, ngày, địa điểm, mô tả, format, assignment_mode, team_size, teams_per_match). Tách khỏi list, dùng toàn màn.
- `TournamentConsole` — khung header + strip "Bước tiếp theo" + tab bar; nhận `tournamentId`, điều phối tab.
- Các tab (mỗi tab 1 component, nhận `tournamentId`):
  - `OverviewTab` — stats + tiến độ vòng.
  - `SettingsTab` — gộp form "Cài đặt" (courts/giờ/reveal/is_active) theo giải.
  - `TeamsTab` — đội & VĐV + nút chia team/cặp.
  - `PairingsTab` — bọc lại `AdminPairingsPage` hiện có (truyền `tournamentId`).
  - `MatchesTab` — tóm tắt trận theo vòng.

Mỗi component có interface rõ: input là `tournamentId` (+ callback reload), tự fetch dữ liệu của riêng nó. Logic "bước tiếp theo" suy ra từ trạng thái (đã chia đội chưa, đã công bố R1 chưa, còn trận pending...).

`app/admin/page.js` chỉ cần đổi nhánh `section === 'tournament'`: nếu có `t` → `<TournamentConsole>`, ngược lại `<TournamentListView>`. Bỏ subtab cứng Tổng quan/Pairings hiện tại.

## 6. Thay đổi Backend (luồn `tournament_id`)

Nguyên tắc: mọi API vận hành nhận `tournamentId` (query cho GET, body cho POST), lọc thêm `.eq('tournament_id', tournamentId)` bên cạnh `group_id`. Mặc định/`fallback` an toàn để không vỡ dữ liệu giải hiện có (`tournament_id = 1`).

Các route cần sửa:
- `GET /api/tournament/admin/overview` — lọc teams/matches/pairings/players theo `tournament_id`.
- `GET|POST /api/tournament/admin/settings` — settings theo từng giải (bỏ `.limit(1)` singleton; khóa theo `(group_id, tournament_id)`).
- `GET|POST /api/tournament/admin/pairings` — pairings theo giải.
- `POST /api/tournament/admin/reorder` — theo giải.
- `GET|POST /api/tournament/admin/toggle-pairings-lock` — theo giải.
- `POST /api/tournament/admin/toggle-round1` — theo giải.
- `POST /api/tournament/admin/reset` — chỉ xóa dữ liệu của giải được chọn (KHÔNG xóa toàn CLB).
- `GET /api/tournament/teams` — theo giải.
- `POST /api/tournaments/auto-assign` — đã nhận `tournamentId`, kiểm tra dùng đúng.
- Live: `GET /api/tournament/live/{scoreboard,matches,pairings}` — nhận `tournamentId` để xem đúng giải (mặc định giải `active` nếu không truyền, giữ tương thích link live cũ).

### 6.1 Schema
- Phần lớn bảng vận hành đã có `tournament_id`. **Cần xác minh & bổ sung migration** cho:
  - `tournament_settings`: hiện code đọc cột phẳng (`tournament_name`, `start_time`, `total_courts`, `round1_reveal_time`, `is_active`...) trong khi `004` định nghĩa dạng key-value → xác nhận shape thực tế trên DB; đảm bảo có `tournament_id` và ràng buộc duy nhất `(group_id, tournament_id)`.
  - Bỏ unique cũ chỉ theo `team_code` nếu còn (đã có index `(group_id, tournament_id, team_code)` từ `012`).
- Migration mới (nếu cần): thêm cột/ràng buộc còn thiếu; backfill `tournament_id = 1` cho dữ liệu cũ; KHÔNG xóa dữ liệu.

## 7. Xử lý lỗi & trường hợp biên
- Không có giải nào → Màn 1 hiện empty state + nút Tạo.
- `t=<id>` không tồn tại / khác group → quay về Danh sách kèm thông báo.
- Reset giải: vẫn double-confirm, nhưng nêu rõ "chỉ xóa dữ liệu của GIẢI NÀY", không phải toàn CLB.
- Thao tác phá hủy (xóa/reset) yêu cầu xác nhận như hiện tại.
- Giữ check admin (`requireGroupAdmin` / `getCurrentGroupClient().role`).

## 8. Kiểm thử
- Dự án dùng test thuần Node (`tests/*.test.js`, chạy `node ...`). Bổ sung/điều chỉnh:
  - `tests/tournament-management-v2.test.js` và `tests/tournament-dashboard.test.js` — cập nhật theo điều hướng/CRUD mới.
  - Test mới: API overview/settings/pairings lọc đúng `tournament_id` (2 giải khác nhau không lẫn dữ liệu) — đây là tiêu chí thành công cốt lõi.
  - Test điều hướng: list → console → tab; `t` không hợp lệ → quay lại list.
- Kiểm thử thủ công trên preview ở khổ mobile (~380px): tạo 2 giải khác format, xác nhận dữ liệu tách biệt.

## 9. Tiêu chí thành công
- Tạo ≥2 giải với thể thức khác nhau; mỗi giải có settings/đội/pairings/trận **độc lập**.
- Trang mobile phân cấp rõ List → Console, không còn cuộn dài 6 khối.
- Không còn form tên/ngày trùng lặp.
- Link/route cũ không vỡ (`view=pairings`, live mặc định giải active).

## 10. Cập nhật sau khi kiểm tra DB thực tế (2026-06-14)

Đã đối chiếu code với schema/dữ liệu thật trên Supabase project `Ranking 246` (`uhhlelemewilgsdijwja`). Phát hiện một số phần **đang hỏng vì lệch schema**, không chỉ là lộn xộn giao diện. Các quyết định dưới đây **ghi đè** giả định ở mục 3.3/6 khi mâu thuẫn.

### 10.1 Hiện trạng đã xác minh
- `tournament_settings` thực tế là **key-value** (`setting_key`, `setting_value` jsonb), KHÔNG có cột phẳng. Keys đang dùng: `round1_reveal_time`, `round1_revealed`, `pairings_locked`, `current_phase`, `round1_winner`, `round2_winner`.
- Route `settings` đọc/ghi cột phẳng (`tournament_name`, `start_time`, `total_courts`, `match_duration_minutes`...) + `order('created_at')` → **không tồn tại** → form Cài đặt hiện **hỏng**, các field sân/giờ/thời lượng **không có nơi lưu và không nơi nào tiêu thụ**.
- `tournament_pairings` dùng FK (`team_id`, `player1_id`, `player2_id`). Route `pairings` admin đọc/ghi `team`, `player1_name`, `player2_name` → **không tồn tại** → editor pairings **hỏng** (GET gom hết vào 'unknown', PUT ghi cột ảo). Overview đọc pairings ĐÚNG qua FK join.
- Unique index của `tournament_settings` là `unique_setting (tournament_id, setting_key)` — **thiếu `group_id`**. Nhưng `toggle-round1` & `toggle-pairings-lock` upsert với `onConflict: 'group_id,tournament_id,setting_key'` → Postgres báo lỗi vì không có unique index khớp → **2 toggle này cũng đang hỏng**, đồng thời là **lỗi multi-tenant** (2 CLB cùng `tournament_id=1` sẽ đụng nhau).
- Phần CHẠY ĐÚNG: `overview` (read), `tournaments` CRUD, `auto-assign` (đã nhận `tournamentId` và scope đầy đủ — dùng làm **mẫu tham chiếu** cho per-tournament).
- Nhiều route hardcode `tournament_id = 1`: `toggle-round1`, `toggle-pairings-lock`, `teams`; còn `overview`, `reorder`, `reset` chỉ lọc theo `group_id`. `reset` còn dùng UUID sentinel trên id kiểu integer (sai), và xóa theo group (không theo giải).

### 10.2 Quyết định đã chốt với người dùng
- **Tab Cài đặt — giữ field + thêm lưu trữ thật.** Lưu các field lịch (start_time, end_time, total_courts, match_duration_minutes, break_duration_minutes, round1_reveal_time) dạng **key-value theo (group_id, tournament_id)** trong `tournament_settings` (đồng nhất với pattern reveal/lock đang chạy). `is_active` bỏ khỏi tab Cài đặt — dùng `tournaments.status` (sửa ở form thông tin giải). Viết lại route `settings` để GET trả 1 object lắp từ các key, POST upsert nhiều key.
- **Tab Pairings — read-only đợt này.** Render từ dữ liệu overview (đã có tên cầu thủ qua FK). KHÔNG bọc editor pairings cũ (đang hỏng). Editor sắp cặp viết lại đúng FK = **đợt sau** (ngoài phạm vi).

### 10.3 Migration cần làm (mục 6.1 thay bằng phần này)
- Migration `013_tournament_settings_group_unique.sql`: `DROP` unique cũ `unique_setting`, tạo `CREATE UNIQUE INDEX ... ON tournament_settings(group_id, tournament_id, setting_key)`. Sửa cả lỗi upsert lẫn đụng độ multi-tenant.
- KHÔNG cần thêm cột mới (settings dùng key-value; các bảng vận hành đã có `tournament_id`).

### 10.4 Phạm vi backend chính xác (thay danh sách ở mục 6)
Mỗi route nhận `tournamentId` (query cho GET, body cho POST/PUT), validate giải thuộc group, lọc `.eq('tournament_id', tournamentId)` cạnh `group_id`:
- Viết lại `GET|POST /api/tournament/admin/settings` → object key-value theo giải.
- `GET /api/tournament/admin/overview` → thêm lọc `tournament_id`.
- `POST /api/tournament/admin/toggle-round1` → nhận `tournamentId` thay cho hardcode `1`.
- `GET|POST /api/tournament/admin/toggle-pairings-lock` → nhận `tournamentId`.
- `POST /api/tournament/admin/reset` → scope `(group_id, tournament_id)`, bỏ UUID sentinel.
- `GET /api/tournament/teams` → nhận `tournamentId` thay cho hardcode `1`.
- `PUT /api/tournament/admin/reorder` → thêm lọc `tournament_id`.
- `auto-assign`, `tournaments` CRUD: đã đúng, chỉ thêm test xác nhận.
- Live routes: ngoài phạm vi đợt này (giữ nguyên; sẽ xử lý khi làm editor pairings).
