# Spec — Tournament Operations (Bàn điều hành giải)

- Ngày: 2026-09-09
- Trạng thái: Draft (chờ user duyệt để chuyển sang plan)
- Thứ tự: **Spec 2 — làm sau Spec 0 và Spec 1**
- Liên quan: **`2026-09-09-tournament-round-scoring-design.md` (Spec 1 — làm trước)**, `tournament-create-wizard-redesign`, `tournament-open-registration`
- Mockup đã duyệt: <https://claude.ai/code/artifact/d842724a-10c9-462a-8200-31844fb7d712>
- Thay thế một phần `docs/pickhub-core/04-phase-tournament-operations.md` — xem mục 11

## 1. Mục tiêu

Dựng **bàn điều hành** cho BTC chạy giải trong ngày thi đấu: một người ngồi máy, cầm mic gọi sân, ghi kết quả, nhìn được cả giải trên một màn hình. Thay console 7 tab hiện tại bằng shell **sidebar theo lộ trình tổ chức giải 8 bước**, nền đen ám tím.

Bối cảnh vận hành do user mô tả: *"chủ yếu 1 BTC ngồi điều hành giải, nếu giải lớn cầm bộ đàm hoặc mic để đọc lịch thi đấu, ghi nhận kết quả và update"*. Mọi quyết định thiết kế dưới đây phục vụ đúng người đó.

## 2. Phạm vi

**Trong phạm vi**

| # | Hạng mục |
|---|---|
| A | Shell sidebar 8 bước + theme tối/tím, thay `/giai-dau/v2/console` |
| B | **Bước 2 · Sân & sơ đồ sân đấu** — khai báo địa điểm/sân, số sân, thời lượng ước tính, bật/tắt sân, sơ đồ mặt bằng, hàng đợi trận chờ, giờ dự kiến |
| C | **Bước 5 · Trung tâm điều hành** — dải tiến độ, bảng sân trực tiếp, gọi vào sân, thẻ đọc mic, BXH live tóm tắt, panel playoff |
| D | Vòng đời trận trong ngày: gọi vào sân → khởi động → đấu → tạm dừng → chốt; đồng hồ trận |
| E | Nhập **tỉ số từng ván**, kiểm theo luật vòng (dùng `resolveMatchScoring` của Spec 1) |
| F | Bỏ cuộc / walkover |
| G | **Bước 8 · Nhật ký thao tác** |
| H | Chuyển 7 tab cũ vào đúng bước, giữ link cũ không vỡ |

**Ngoài phạm vi — để spec thứ ba (`tournament-draw-and-corrections`)**

- **Bốc thăm chi tiết**: đổi chỗ đội giữa bảng/nhánh, bốc lại, chốt/huỷ chốt. Bước 4 trong spec này chỉ là *sinh lịch + xem lịch đã sinh* như hiện có.
- **Correction**: sửa tỉ số trận **đã chốt**, bắt lý do, tính lại BXH và nhánh loại trực tiếp.

**Ngoài phạm vi — chưa có kế hoạch**

Check-in / QR check-in, thông báo, tài chính giải, live scoring từng điểm, PHR confirmation, offline/đồng bộ lại, xuất ảnh chia sẻ (đã có ở `lib/tournament/share.js`, không đụng).

## 3. Hiện trạng đã kiểm chứng trên DB thật

Truy vấn ngày 2026-09-09, project `uhhlelemewilgsdijwja`:

- `tournament_matches.status` bị ràng buộc bởi `tournament_matches_status_phase3_ck` = **`pending` | `live` | `finalized`**. Migration 015 ghi `done` nhưng Phase 3 đã thay. Mọi code mới phải dùng `finalized`.
- `tournament_matches` **không có cột thời gian nào**. Có sẵn: `division_id`, `entry_a_id`/`entry_b_id`, `winner_entry_id`, `version` (mặc định 1), `result_type` (mặc định `'simple'`, **không có CHECK**), `court` kiểu `text` (di sản).
- `tournament_venues` / `tournament_courts` / `tournament_match_assignments` **đã tồn tại và rỗng 0 dòng** (migration 039 đã apply). Cột dùng được ngay: `courts(venue_id, label, surface, active, availability jsonb)`, `assignments(match_id, court_id, time_slot_id, scheduled_start, scheduled_end, version, status, locked)`.
- `tournaments.settings` là `jsonb` — chỗ để cấu hình vận hành, không cần cột mới.

## 4. Điều hướng — lộ trình 8 bước

Sidebar thay thanh 7 tab. Nhóm và số thứ tự phản ánh **trình tự tổ chức giải thật**, không phải nhóm chức năng.

| Bước | Tên | Nội dung | Nguồn |
|---|---|---|---|
| **Chuẩn bị** ||||
| 1 | Cấu hình giải & số ván | `SettingsTab` cũ + `RoundScoringPanel` của Spec 1 | có sẵn + Spec 1 |
| 2 | Sân & sơ đồ sân đấu | **mới hoàn toàn** — mục 5 | mới |
| 3 | VĐV & cặp đấu | `TeamsTab` cũ; giải cộng đồng thêm `OpenRegTab` | có sẵn |
| 4 | Bốc thăm & chốt lịch | sinh lịch + xem lịch đã sinh (bốc thăm chi tiết → spec 3) | có sẵn |
| **Đang diễn ra** ||||
| 5 | **Trung tâm điều hành** | khối nổi bật, viền gradient, nhãn **LIVE** nhấp nháy, dòng tóm tắt `3 sân đang chạy · 14/22` — mục 6 | mới |
| **Trong & sau giải** ||||
| 6 | Lịch thi đấu & kết quả | `ResultsTab` cũ + 3 chip BO lối tắt (Spec 1) | có sẵn + Spec 1 |
| 7 | Bảng đấu & xếp hạng | `StandingsTab` + `BracketTab` cũ gộp lại | có sẵn |
| 8 | Nhật ký thao tác | **mới** — mục 9 | mới |

Bước 1–4 hiện dấu ✓ khi hoàn thành, kèm bộ đếm `4/4 xong` trên đầu nhóm. Điều kiện "xong":

| Bước | Xong khi |
|---|---|
| 1 | Giải có ≥1 nội dung và ≥1 giai đoạn |
| 2 | Có ≥1 sân `active` |
| 3 | Mỗi nội dung có ≥2 đội/cặp |
| 4 | Mỗi giai đoạn đã sinh lịch (có ≥1 trận) |

Đây là **chỉ dấu, không phải cổng chặn**: BTC vẫn bấm vào bước bất kỳ. Riêng bước 4 chặn thật — không sinh lịch được khi bước 1–3 chưa xong, vì thiếu dữ liệu.

**Giữ link cũ.** Route vẫn là `/giai-dau/v2/console`; tham số `?tab=` cũ được ánh xạ sang bước mới (`overview`→5, `results`→6, `standings`|`bracket`→7, `teams`|`openreg`→3, `settings`→1) rồi thay bằng `?step=`. Bookmark và link đã chia sẻ không vỡ.

**Dọn dẹp.** `app/giai-dau/v2/operations/` (chưa commit, 96 dòng, chưa ai dùng) bị **xoá** khi shell mới chạy được — nó là bản nháp của chính màn bước 5.

## 5. Bước 2 — Sân & sơ đồ sân đấu

### 5.1 Vì sao số sân là hạng mục riêng

Số sân không phải khai báo cho có: nó **quyết định giờ tan giải**. Màn này phải nói thẳng điều đó bằng một ô hệ quả:

> Đang bố trí **4 sân** cho **22 trận** → ước tính hoàn tất **17:38**.
> Tắt sân 03 còn **3 sân** → lùi sang **18:24** (+46 phút).

### 5.2 Dữ liệu

Dùng nguyên `tournament_venues` + `tournament_courts` đã có. Hai tham số vận hành đặt trong `tournaments.settings` (jsonb, không cần migration):

```jsonc
"settings": {
  "operations": {
    "estimated_match_minutes": 22,   // gồm cả thử sân
    "warmup_minutes": 4,
    "day_start": "07:00"
  }
}
```

### 5.3 Ba khối màn hình

1. **Số sân dành cho giải** — stepper tăng/giảm số sân (tạo/xoá bản ghi `tournament_courts` với `label` tự sinh `Sân 01`…), ô thời lượng ước tính, ô hệ quả nói ở 5.1.
2. **Danh sách sân** — mỗi sân một hàng: nhãn, mặt sân (`surface`), công tắc `active`. Tắt sân giữa giải thì các trận đang gán ở đó **tự đẩy về hàng đợi** (xoá `court_id` khỏi assignment, không xoá bản ghi), giờ dự kiến các trận sau dịch theo. Ghi một dòng nhật ký.
3. **Sơ đồ mặt bằng + hàng đợi** — thẻ mỗi sân theo trạng thái sân (mục 6.2) và danh sách trận chờ theo thứ tự, kèm giờ dự kiến.

### 5.4 Giờ dự kiến — suy ra, không lưu

Giờ dự kiến **tính khi đọc**, không ghi xuống DB:

```
sân rảnh sớm nhất = với mỗi sân active: giờ kết thúc dự kiến của trận đang chạy trên sân đó
                    (started_at + estimated_match_minutes), hoặc "bây giờ" nếu sân trống
trận thứ k trong hàng đợi → gán vào sân rảnh sớm nhất, cộng dồn estimated_match_minutes
ước tính hoàn tất giải = giờ kết thúc dự kiến của trận cuối cùng
```

Lý do không lưu: giờ dự kiến đổi mỗi khi có trận kết thúc sớm/muộn hoặc sân bật/tắt — lưu xuống là tự chuốc lấy dữ liệu lệch. `tournament_match_assignments.scheduled_start` **chỉ dùng khi BTC ghim giờ cố định** cho một trận (`locked = true`); trận ghim thì được tôn trọng và các trận khác né ra.

### 5.5 Sân của một trận — nguồn sự thật

`tournament_match_assignments.court_id` là **nguồn sự thật**. `tournament_matches.court` (text) là di sản, đang được trang công khai và một số component cũ đọc; mỗi lần ghi assignment phải **ghi kèm nhãn sân** vào `matches.court` để không vỡ. Ghi chú trong code là cột di sản, gỡ ở spec sau.

## 6. Bước 5 — Trung tâm điều hành

### 6.1 Bố cục

Từ trên xuống: dải giải (badge + tên + 3 số liệu + thanh tiến độ) → **bảng sân trực tiếp** → hai cột (BXH live | panel playoff) → thanh thao tác nhanh dính đáy.

Ba số liệu trên dải giải, **chỉ dùng dữ liệu có thật**:

| Số liệu | Tính từ |
|---|---|
| Tiến độ thi đấu `14/22 · 64%` | đếm `status = 'finalized'` / tổng trận |
| Ước tính hoàn tất `17:38` | mục 5.4 |
| Thời lượng trận trung bình `21:40` | trung bình `ended_at − started_at` các trận đã chốt |

Ba thứ trong thiết kế Stitch đã bị **loại bỏ vì không có dữ liệu**: `8.4 chạm/rally` (không đếm chạm bóng), `DUPR` (không nối DUPR — dùng **PHR** nội bộ từ `tournament_athlete_phr_history`), `Live Stream` (không có hạ tầng).

### 6.2 Trạng thái sân — suy ra từ trận

Sân **không có cột trạng thái**. Trạng thái sân là kết quả suy ra, nhờ đó không bao giờ lệch với trận:

| Trạng thái sân | Điều kiện | Màu | Hành động chính |
|---|---|---|---|
| Đang đấu | có trận `live` gán ở sân | cyan | Ghi điểm · Tạm dừng |
| Khởi động | có trận `warmup` gán ở sân | gold | Bắt đầu đấu · +2 phút |
| Trống — cần gọi | không có trận `live`/`warmup`, hàng đợi còn trận | **coral** | **Gọi vào sân ngay** |
| Trống — hết trận | hàng đợi rỗng | xám | — |
| Ngưng dùng | `courts.active = false` | mờ | — |

Sân trống mà còn trận chờ dùng **coral** (vai "trạng thái cần chú ý" trong brand system) chứ không phải màu hiền: đó là thứ duy nhất trên màn hình đang **chờ BTC hành động**.

### 6.3 Vòng đời trận trong ngày

Tám cạnh hợp lệ, mọi cạnh khác bị từ chối:

| # | Từ → Đến | Hành động |
|---|---|---|
| 1 | `pending` → `warmup` | Gọi vào sân |
| 2 | `warmup` → `pending` | Huỷ gọi (gọi nhầm, VĐV chưa tới) |
| 3 | `warmup` → `live` | Bắt đầu đấu |
| 4 | `live` → `paused` | Tạm dừng (mưa, chấn thương) |
| 5 | `paused` → `live` | Đấu tiếp |
| 6 | `live` → `finalized` | Chốt trận |
| 7 | `warmup` → `finalized` | Bỏ cuộc trước khi đấu → `result_type = 'walkover'` |
| 8 | `paused` → `finalized` | Bỏ giữa chừng → `result_type = 'retired'` |

`pending → live` **phải hỏng**: mọi trận đều đi qua `warmup`, nếu không thì không có `warmup_started_at` để tính thời gian chiếm sân.

- **Gọi vào sân**: BTC bấm trên **một thẻ sân trống**; hộp chọn mặc định là **trận đầu hàng đợi** nhưng đổi sang trận khác được (thực tế hay phải đảo vì một cặp chưa có mặt). Gán `court_id`, set `warmup`, ghi `warmup_started_at`, mở **thẻ đọc mic**.
- **+2 phút**: đẩy `warmup_started_at` lùi lại 2 phút. Chỉ là đồng hồ, không có cột riêng.
- **Bắt đầu đấu**: `live`, ghi `started_at`. Đồng hồ trận đếm từ đây.
- **Tạm dừng**: `paused`; sân vẫn coi là đang bận (mưa, chấn thương nhẹ). Đồng hồ vẫn chạy — thời gian tạm dừng nằm trong thời lượng trận, đúng thực tế chiếm sân.
- **Chốt trận**: `finalized`, ghi `ended_at`, nhả sân → sân chuyển "trống — cần gọi".

### 6.4 Thẻ đọc mic

Bấm "Gọi vào sân ngay" mở một thẻ chữ lớn để BTC **đọc thẳng vào micro**: tên hai cặp + CLB, số sân, nội dung/bảng/lượt, luật vòng. **Không có giọng đọc máy, không đẩy thông báo tới VĐV** — đã chốt với user. Nút xác nhận "Đã gọi — chuyển sân sang Khởi động" mới thực sự đổi trạng thái.

### 6.5 Nhiều nội dung chạy song song

Bảng sân **trộn chung mọi nội dung**, mỗi thẻ sân ghi rõ `Đôi nam 3.0 · Bảng A`. Người điều phối sân nhìn theo sân, không nhìn theo nội dung. BXH và panel playoff thì ngược lại — có bộ chọn nội dung, vì xếp hạng chỉ có nghĩa trong một nội dung.

## 7. Nhập tỉ số

**Từng ván, không phải từng điểm.** Đã chốt: một BTC không thể bấm điểm cho 4 sân cùng lúc; `Call: 11-9-2`, `GIAO BÓNG #2`, `MATCH POINT` trong thiết kế Stitch đều bị bỏ.

Bảng nhập: mỗi ván một hàng hai ô số. Luật đem ra kiểm là **luật của vòng chứa trận đó** — `resolveMatchScoring(...)` từ Spec 1, không phải luật chung của giải. Lỗi hiển thị bằng tiếng Việt nói rõ vi phạm gì: *"Luật vòng 2 là tới 11 cách 2, nên 13–7 không thể xảy ra — trận đã kết thúc ở 11–7."*

Chốt trận khi một bên đạt `ceil(best_of / 2)` ván thắng. Ghi đủ ván vào `tournament_games`, cập nhật `winner_entry_id`, `status = 'finalized'`, `ended_at`.

**Bỏ cuộc / walkover**: chọn bên thua, set `result_type` = `'walkover'` (không ra sân) hoặc `'retired'` (bỏ giữa chừng), giữ nguyên các ván đã đánh, bắt nhập lý do, ghi nhật ký. Đây là trường hợp **duy nhất** trong spec này bắt nhập lý do.

**Cạnh tranh ghi.** `tournament_matches.version` đã có sẵn — mọi lệnh đổi trạng thái/ghi điểm gửi kèm `version` đang thấy, ghi bằng `WHERE id = ? AND version = ?` rồi `version + 1`; không khớp trả 409 `MATCH_VERSION_CONFLICT`, UI tải lại. Áp dụng tương tự cho `tournament_match_assignments.version`.

## 8. Migration `043_tournament_operations.sql`

Chỉ thêm, không xoá dữ liệu. Không `DROP TABLE`, không `TRUNCATE`.

```sql
-- 1. Mốc thời gian trận
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS started_at        timestamptz;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS ended_at          timestamptz;

-- 2. Mở rộng trạng thái trận: thêm warmup + paused, GIỮ finalized
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_phase3_ck;
ALTER TABLE public.tournament_matches ADD CONSTRAINT tournament_matches_status_phase4_ck
  CHECK (status IN ('pending','warmup','live','paused','finalized'));

-- 3. Ràng buộc kiểu kết quả (trước đây không có CHECK)
ALTER TABLE public.tournament_matches ADD CONSTRAINT tournament_matches_result_type_ck
  CHECK (result_type IN ('simple','mlp','team','walkover','retired'));

-- 4. Nhật ký thao tác
CREATE TABLE IF NOT EXISTS public.tournament_operation_logs (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  group_id      bigint NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  tournament_id bigint NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  division_id   bigint REFERENCES public.tournament_divisions(id) ON DELETE SET NULL,
  actor         text NOT NULL,
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_id     bigint,
  before        jsonb,
  after         jsonb,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tournament_operation_logs_tournament
  ON public.tournament_operation_logs(group_id, tournament_id, created_at DESC);
```

**Rủi ro của mục 3.** `result_type` hiện `NOT NULL DEFAULT 'simple'` và chưa có CHECK — phải chạy `SELECT DISTINCT result_type FROM tournament_matches` trước để xác nhận không có giá trị lạ, rồi mới thêm constraint. Hôm nay bảng có 0 dòng nên an toàn, nhưng plan vẫn phải có bước kiểm này.

## 9. Bước 8 — Nhật ký thao tác

Bảng: `Lúc · Người làm · Việc · Trước → Sau · Lý do`. Ghi cho các hành động:

| `action` | `target_type` | Bắt lý do |
|---|---|---|
| `tournament_status_changed` | `tournament` | không |
| `round_scoring_changed` | `stage` | không |
| `court_toggled` | `court` | có |
| `court_count_changed` | `tournament` | không |
| `match_called` / `match_started` / `match_paused` / `match_finalized` | `match` | không |
| `match_court_changed` | `match` | có |
| `match_walkover` | `match` | **có** |
| `draw_locked` / `draw_unlocked` | `stage` | chỉ khi huỷ chốt |
| `result_corrected` | `match` | **có** |

Bốn dòng cuối do Spec 0 và Spec 3 ghi vào; bảng này tạo ở Spec 2 nên **Spec 0 làm trước sẽ chưa ghi log được** — plan phải bổ sung phần ghi log của Spec 0 ngay sau khi bảng ra đời.

Chỉ đọc, không sửa, không xoá.

## 10. Giao diện — token

**Nguồn chuẩn là `ADR-006` (`accepted`, 2026-09-07) và spec `2026-09-08-pickhub-design-system-va-bxh-design` (`approved`)**, không phải `app/globals.css`. Hai quyết định ràng buộc spec này:

1. **Font là `Montserrat`**, không phải `Outfit`. ADR-006 gỡ hẳn `Outfit` khỏi sản phẩm. *(Mockup đã duyệt dựng bằng Outfit — khi thi công phải đổi sang Montserrat; đây là sai sót của mockup, không phải quyết định thiết kế.)*
2. **Chỉ dùng token `--ph-*`.** Các token `--court-green`, `--pickle-lime`, `--surface-court`, `--live-cyan`, `--rally-coral` đang có trong `globals.css` **bị khai tử** — đi qua `app/styles/legacy-aliases.css`. Spec này **không được khai token màu mới**; bộ tối là các biến `--ph-*-dark-*` bổ sung vào `app/styles/tokens.css`.

Bảng màu: tím `--ph-indigo #6F48C9`, mực `--ph-ink #28243D`, `--ph-gold #FFC95E`, `--ph-coral #FF8B83`, `--ph-cyan #A8DFE9`, trên nền đen ám tím. Thống nhất với spec `tournament-open-registration` (*"tông tối/tím ở mặt công khai lẫn console"*).

Vai màu ngữ nghĩa tách khỏi màu thương hiệu: tím = hành động chính và trạng thái đang chọn; cyan = đang chạy tốt; gold = đang đếm ngược; coral = cần chú ý.

> **Cảnh báo tương phản.** Spec design system dòng 166–169 xác định `--ph-cyan` và `--ph-coral` **chỉ dùng làm nền/accent, không dùng cho chữ** — trên nền trắng chúng chỉ đạt ~1.3:1 và ~2.5:1. Bàn điều hành dùng chúng làm **chữ trên nền đen**, là phép đo khác hẳn. Plan phải có bước **đo lại tương phản của mọi cặp màu/nền trong theme tối** và chỉnh sắc độ cho đạt AA 4.5:1 trước khi chốt token — không được suy ra từ con số đo trên nền sáng.

> **Ngoại lệ phải ghi vào brand system.** `UI-BRAND-SYSTEM.md` dòng 34 viết *"Không dùng nền đen hoặc navy đặc trong các màn hình vận hành"*. Bàn điều hành cố ý phá lệ: màn hình đứng lâu trong nhà thi đấu, cần tương phản cao và đọc được từ xa. Plan phải có một bước **sửa `UI-BRAND-SYSTEM.md`** để ghi nhận ngoại lệ này kèm lý do — không im lặng làm trái tài liệu.

**Responsive.** Sidebar cố định từ 900px trở lên; dưới 900px thành drawer trượt, mở bằng nút hamburger. Bảng sân: 1 cột dưới 640px, 2 cột từ 640px, 4 cột từ 1240px. Mọi bảng rộng nằm trong khung `overflow-x: auto`.

## 11. Quan hệ với `04-phase-tournament-operations.md` và lớp Phase 4 chưa commit

Doc Phase 4 cũ (199 dòng) viết theo góc state-machine/backend và **rộng hơn spec này rất nhiều**. Spec này **cắt gọt** nó:

| Trong doc Phase 4 | Spec này |
|---|---|
| Venue/court, scheduling, match state machine | **Nhận** — mục 5, 6 |
| Score submission, correction | **Hoãn** → spec 3 |
| Registration state machine, check-in, waitlist, substitution | **Bỏ** — đã có luồng riêng ở `tournament-open-registration` |
| Notifications, tài chính giải, PHR confirmation, offline/concurrency, xuất ảnh | **Bỏ khỏi phạm vi** — chưa có nhu cầu thật từ user |

**Lớp code Phase 4 chưa commit** (11 route + `lib/tournament/operations.js` + trang `operations/`) là bản nháp chất lượng thấp (`operations.js` 56 dòng, route `schedule` viết dồn một dòng minify). Quyết định đã chốt với user: **giữ schema, viết lại lib/API/UI**. Cụ thể:

| Route chưa commit | Xử lý |
|---|---|
| `courts`, `venues`, `assignments`, `schedule` | **Viết lại** theo spec này |
| `check-ins`, `qr-checkins`, `score-submissions`, `corrections`, `notifications`, `finance`, `time-slots` | **Không commit vào main** — chưa spec nào dùng, chưa ai gọi, để lại chỉ tạo bề mặt tấn công và nợ kỹ thuật. Bảng DB tương ứng giữ nguyên (rỗng, vô hại). |

## 12. Kiểm thử

**Lớp thuần** — `tests/tournament/operations.test.js`, node test:

1. `computeCourtState`: sân có trận `live` → `playing`; có `warmup` → `warming`; trống + hàng đợi còn trận → `needs_call`; trống + hàng đợi rỗng → `idle`; `active=false` → `off`.
2. `projectSchedule`: 4 sân · 22 trận · 22 phút → giờ hoàn tất khớp tính tay; tắt 1 sân → lùi đúng số phút; trận `locked` giữ nguyên giờ ghim và các trận khác né ra.
3. `transitionMatch`: đủ 8 cạnh ở bảng 6.3 đi qua; `pending → live`, `finalized → live`, `pending → finalized` đều ném lỗi.
4. `matchElapsed`: `live` → đếm từ `started_at`; `finalized` → `ended_at − started_at`; `warmup` → đếm ngược từ `warmup_started_at + warmup_minutes`, hết giờ trả 0 chứ không âm.
5. `averageMatchMinutes`: bỏ qua trận thiếu `started_at`/`ended_at`; không có trận nào xong → trả `null` (UI hiện gạch ngang, không hiện `NaN`).
6. Chốt trận dùng `best_of` của **vòng** (Spec 1), không phải của giai đoạn.

**Hợp đồng API** — theo kiểu `tests/phase3/*-contract.test.js`:

7. Mọi route mới truy vấn đều có `.eq('group_id', ...)`; mọi route ghi đều qua guard admin.
8. Ghi trận với `version` cũ → 409 `MATCH_VERSION_CONFLICT`.
9. Tắt sân đang có trận `live` → 409, kèm thông báo phải chốt hoặc chuyển trận trước.
10. Mỗi hành động ở mục 9 sinh đúng một dòng `tournament_operation_logs`; hành động bắt lý do mà thiếu `reason` → 400.

**Kiểm bằng trình duyệt** (không tự động hoá được, plan phải liệt kê để làm tay): mở console ở 390px / 834px / ≥1280px, kiểm drawer, kiểm tương phản chữ trên nền đen, chạy trọn một trận từ "Gọi vào sân" đến "Chốt trận" trên dữ liệu test có `group_id` riêng.

## 13. Thứ tự thực thi

1. **Spec 1** (số ván theo vòng) — làm trước, vì mục 7 phụ thuộc `resolveMatchScoring`.
2. Migration 043 + lớp thuần (`computeCourtState`, `projectSchedule`, `transitionMatch`, `matchElapsed`) + test đỏ trước.
3. API: `courts`, `venues`, `assignments`, `matches/transition`, `operation-logs`.
4. Shell sidebar + ánh xạ `?tab=` → `?step=`, chuyển 7 tab cũ vào bước.
5. Bước 2 (sân), rồi bước 5 (điều hành), rồi bước 8 (nhật ký).
6. Xoá `app/giai-dau/v2/operations/`; cập nhật `UI-BRAND-SYSTEM.md`.

## 14. Ràng buộc chung

- Không đụng `lib/tournament/engines/*` (IDE khác đang làm double-elim + trận đội).
- Không `DROP TABLE` / `TRUNCATE` / reset DB.
- Mọi truy vấn scope `group_id`; mọi ghi qua guard admin (`pickhub-engineering`).
- Dữ liệu kiểm thử dùng CLB/giải test riêng, dọn sau khi xác nhận không chạm dữ liệu thật.
- Thông báo lỗi cho BTC viết bằng **tiếng Việt**, nói rõ việc phải làm để sửa.
