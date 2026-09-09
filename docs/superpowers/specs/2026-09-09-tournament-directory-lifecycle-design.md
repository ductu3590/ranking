# Spec — Tournament Directory & Lifecycle (Danh sách giải & vòng đời trạng thái)

- Ngày: 2026-09-09
- Trạng thái: Draft (chờ user duyệt để chuyển sang plan)
- Thứ tự: **Spec 0 — làm trước Spec 1 và Spec 2**, vì đây là cửa vào module và có một lỗi đang chờ nổ
- Liên quan: `tournament-round-scoring` (Spec 1), `tournament-operations` (Spec 2), `tournament-draw-standings-corrections` (Spec 3), `tournament-create-wizard-redesign`, `tournament-open-registration`

## 1. Mục tiêu

Menu **Giải** là cửa vào module. Trang danh sách phải trả lời ngay ba câu của BTC: *giải nào sắp tới, giải nào đang chạy, giải nào xong rồi* — rồi mới dẫn vào bàn điều hành. Đồng thời sửa lỗi trạng thái giải đang tồn tại trong code.

## 2. Hiện trạng đã kiểm chứng

Đọc code + truy vấn DB thật (`uhhlelemewilgsdijwja`) ngày 2026-09-09.

**Đã có**
- `lib/globalNavigation.js:5` — mục **Giải** 🏆 trỏ `/giai-dau`.
- `app/giai-dau/page.js` và `app/giai-dau/admin/page.js` — cùng redirect sang `/giai-dau/v2`.
- `app/giai-dau/v2/page.js` (351 dòng) — danh sách card (chip trạng thái, ngày, tên, loại, địa điểm), nút **+ Tạo giải**, **Sửa** / **Xoá** cho admin. Bấm card → `?t=<id>` → render `TournamentConsoleV2` **trong cùng route**.

**Lỗi phải sửa**

`tournaments_status_phase3_ck` trên DB cho phép **7 giá trị**:

```
draft | registration_open | registration_closed | scheduled | live | completed | archived
```

Nhưng `app/giai-dau/v2/page.js:10-21` chỉ biết **3**: `draft` / `active` / `completed`. **`active` không nằm trong 7 giá trị hợp lệ.** `app/api/tournament-v2/tournaments/route.js` liệt `'status'` vào danh sách trường được ghi (dòng 16) nhưng **không validate**, đẩy thẳng xuống Postgres. Hệ quả: admin mở "Sửa giải", chọn **"Đang diễn ra"**, bấm Lưu → vi phạm CHECK → **500 kèm thông báo lỗi Postgres bằng tiếng Anh**.

Chưa ai gặp vì cả 4 giải trong DB đều đang ở `draft` (`select status, count(*) from tournaments` → `draft: 4`). **Không có dữ liệu hỏng cần vá** — chỉ cần sửa code.

**Thiếu**
- Không nhóm *đã / đang / sắp*; không sắp xếp theo ngày; không lọc; không tìm kiếm.
- `updateTournament` không kiểm `status`, cũng không kiểm chuyển trạng thái có hợp lệ không.

**Nợ kỹ thuật ghi nhận, không xử lý trong spec này**

`tournament_divisions` có tới **bốn** cột trạng thái chồng nhau: `registration_status`, `scheduling_status`, `competition_status`, `schedule_publication_status`. Spec này chỉ đụng `tournaments.status`. Việc gộp/dọn bốn cột kia cần một đợt riêng — ghi vào đây để không quên.

## 3. Vòng đời trạng thái giải

Giữ nguyên 7 giá trị DB đã có, **không migration**. Định nghĩa rõ nghĩa và các cạnh hợp lệ:

| Trạng thái | Nghĩa | Nhóm hiển thị |
|---|---|---|
| `draft` | Đang dựng, chưa công bố | **Sắp** |
| `registration_open` | Đang nhận đăng ký (giải cộng đồng) | **Sắp** |
| `registration_closed` | Hết hạn đăng ký, chưa bốc thăm | **Sắp** |
| `scheduled` | Đã chốt lịch, chờ tới ngày | **Sắp** |
| `live` | Đang thi đấu | **Đang** |
| `completed` | Đã chốt kết quả | **Đã** |
| `archived` | Lưu trữ, chỉ đọc | **Đã** |

**Cạnh hợp lệ**

| # | Từ → Đến | Ai bấm | Điều kiện chặn |
|---|---|---|---|
| 1 | `draft` → `registration_open` | BTC | giải phải là `organizer_type = 'community'` và có ≥1 nội dung mở đăng ký |
| 2 | `draft` → `scheduled` | BTC | đã sinh lịch cho mọi giai đoạn (giải nội bộ/giao hữu, không qua đăng ký mở) |
| 3 | `registration_open` → `registration_closed` | BTC, hoặc tự động khi qua `registration_deadline` | — |
| 4 | `registration_closed` → `scheduled` | BTC | đã sinh lịch cho mọi giai đoạn |
| 5 | `scheduled` → `live` | BTC | — |
| 6 | `live` → `completed` | BTC | **mọi trận `finalized`** — xem mục 6 |
| 7 | `completed` → `archived` | BTC | — |
| 8 | `registration_closed` → `registration_open` | BTC | mở lại đăng ký muộn |
| 9 | `scheduled` → `draft` | BTC | chưa có trận nào `live`/`finalized` **và** chưa có đăng ký nào ở `approved`; dùng khi phải làm lại từ đầu |
| 10 | `live` → `scheduled` | BTC | chưa có trận nào `finalized`; dùng khi bấm nhầm |
| 11 | `registration_open` → `draft` | BTC | **chưa có đăng ký nào ở `approved`**; dùng khi mở đăng ký nhầm |

> `tournament_registrations.status` không có giá trị `checked_in` (CHECK cho: `draft, submitted, approved, changes_requested, rejected, withdrawn, awaiting_partner, merged`). Guard chỉ đếm `approved`.

Cạnh 9 và 11 bị chặn khi đã có đăng ký được duyệt → **409 `TOURNAMENT_HAS_APPROVED_REGISTRATIONS`**, kèm số lượng. Lý do: quay về `draft` là ẩn giải khỏi trang công khai — VĐV đã được duyệt sẽ mất chỗ mà không biết.

Mọi cạnh khác bị từ chối **400 `INVALID_STATUS_TRANSITION`**, kèm câu tiếng Việt nói rõ đang ở trạng thái nào và đi được sang đâu.

`archived` là **trạng thái cuối** — không quay lại được. Spec này chỉ định nghĩa cạnh 7 và cho giải archived hiện ở nhóm "Đã", **không làm giao diện kho lưu trữ riêng**; đó là việc sau nếu số giải nhiều lên.

## 4. Trang danh sách

Route giữ nguyên `/giai-dau/v2`.

**Bố cục** — ba nhóm xếp dọc theo đúng thứ tự người dùng quan tâm:

1. **Đang diễn ra** — lên đầu, thẻ to hơn, có nhãn LIVE và dòng tiến độ `14/22 trận`. Bấm vào → thẳng **bước 5 · Trung tâm điều hành** (Spec 2).
2. **Sắp tổ chức** — sắp theo `event_date` tăng dần, giải không có ngày xếp cuối nhóm. Bấm vào → **bước 1 · Cấu hình** nếu còn `draft`, ngược lại → bước gần nhất chưa xong theo lộ trình 8 bước.
3. **Đã kết thúc** — sắp theo `event_date` giảm dần, mặc định **thu gọn, chỉ hiện 5 giải gần nhất** + nút "Xem tất cả". Bấm vào → **bước 7 · Bảng đấu & xếp hạng**.

Nhóm rỗng thì **ẩn hẳn**, không hiện khung trống. Chưa có giải nào → một trạng thái rỗng duy nhất với nút "+ Tạo giải đầu tiên".

**Thanh công cụ**: ô tìm theo tên (lọc phía client, danh sách một CLB không lớn), nút **+ Tạo giải** (chỉ admin).

**Thẻ giải** hiển thị: tên, chip trạng thái, ngày, địa điểm, số nội dung, phạm vi (`Nội bộ` / `Giao hữu` / `Cộng đồng` từ `organizer_type` + `visibility`). Admin có **Sửa** / **Xoá** như hiện nay.

**Xoá**: chỉ cho khi giải ở `draft` **và** chưa có trận nào. Ngoài ra dùng `archived`. Đây là siết so với hiện tại (đang cho xoá mọi giải) — cố ý, để không mất kết quả đã đấu.

**Quyền**: member thấy danh sách nhưng không thấy `draft`, không có nút tạo/sửa/xoá. Admin thấy tất cả.

## 5. API

`app/api/tournament-v2/tournaments/route.js` — sửa, không viết mới:

- **Thêm hằng** `TOURNAMENT_STATUSES` và `STATUS_TRANSITIONS` trong `lib/tournament/lifecycle.js` (mới, thuần).
- **PATCH**: nếu body có `status`, phải nạp trạng thái hiện tại rồi kiểm cạnh; sai → 400 `INVALID_STATUS_TRANSITION`. Trạng thái lạ → 400 `INVALID_STATUS`.
- **POST**: chỉ nhận `draft` (bỏ qua `status` gửi lên) — giải mới luôn bắt đầu ở `draft`.
- **DELETE**: thêm kiểm điều kiện xoá ở mục 4.
- **GET**: trả kèm `group` (nhóm hiển thị) và `match_progress` `{ finalized, total }` cho **mọi giải đã sinh lịch** — giải `live` hiện `14/22 · 64%`, giải `completed` hiện `22/22 · 100%`. Giải chưa có trận trả `null`. Trang danh sách không phải gọi thêm.

Mọi thay đổi trạng thái ghi một dòng `tournament_operation_logs` với `action = 'tournament_status_changed'`. **Bảng này do Spec 0 tạo** (mục 8) chứ không phải Spec 2 — trước đây định để Spec 2 tạo, nhưng như vậy Spec 0 chạy trước sẽ không ghi log được, tạo ra một khoảng thời gian mất dấu vết. Một `CREATE TABLE` rẻ hơn nhiều so với việc phải quay lại bổ sung.

## 6. Chốt giải (`live` → `completed`)

Điều kiện: **mọi trận của mọi giai đoạn phải ở `finalized`**. Còn trận chưa xong → 409 `TOURNAMENT_HAS_OPEN_MATCHES`, kèm danh sách nội dung/vòng còn dang dở để BTC biết đi đâu.

Chốt xong:
- Mọi trận thành chỉ đọc; sửa kết quả phải qua correction (Spec 3).
- Hạng chung cuộc từng nội dung được tính và ghim (Spec 3).
- Trang công khai chuyển sang thể hiện kết quả cuối.

Trường hợp giải bỏ dở giữa chừng (mưa, huỷ): **không có trạng thái `cancelled`** trong 7 giá trị DB. BTC dùng `archived` và ghi lý do vào mô tả giải. Ghi nhận đây là giải pháp tạm; thêm `cancelled` cần migration, để dành khi có nhu cầu thật.

## 7. Migration `045_tournament_operation_logs.sql`

`tournaments.status` **không cần migration** — 7 giá trị đã có sẵn, và `select status, count(*) from tournaments` cho thấy cả 4 giải đều ở `draft`, không có dữ liệu `active` hỏng cần vá.

Chỉ tạo bảng nhật ký, dùng chung cho Spec 0, 2 và 3:

```sql
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

## 8. Kiểm thử

`tests/tournament/lifecycle.test.js` — node test thuần:

1. `TOURNAMENT_STATUSES` khớp đúng 7 giá trị của `tournaments_status_phase3_ck`; `'active'` **không** nằm trong đó.
2. `canTransition`: 10 cạnh ở mục 3 trả `true`; `draft → live`, `completed → live`, `archived → *` trả `false`.
3. `groupOf(status)`: 4 trạng thái đầu → `upcoming`, `live` → `running`, `completed`/`archived` → `finished`.
4. Sắp xếp: nhóm Sắp tăng dần theo ngày, giải thiếu ngày xếp cuối; nhóm Đã giảm dần.
5. `canDelete`: `draft` + 0 trận → `true`; `draft` + có trận → `false`; `completed` → `false`.

Hợp đồng API:

6. PATCH `status: 'active'` → 400 `INVALID_STATUS` (không phải 500 Postgres).
7. PATCH `draft → live` → 400 `INVALID_STATUS_TRANSITION`.
8. PATCH `live → completed` khi còn trận `pending` → 409 `TOURNAMENT_HAS_OPEN_MATCHES`.
9. POST kèm `status: 'live'` → giải được tạo vẫn ở `draft`.
10. Mọi truy vấn có `.eq('group_id', ...)`; mọi ghi qua guard admin.

**Kiểm tay**: mở `/giai-dau/v2` ở 390px / 834px / ≥1280px; xác nhận ba nhóm, nhóm rỗng ẩn hẳn; mở form Sửa và thử đổi trạng thái sai để thấy thông báo tiếng Việt thay vì lỗi Postgres.

## 9. Ràng buộc

- Migration **043** chỉ tạo một bảng mới, không đụng bảng đang có dữ liệu.
- Không đụng `lib/tournament/engines/*`.
- Không `DROP` / `TRUNCATE`.
- Mọi truy vấn scope `group_id`; mọi ghi qua guard admin.
- Thông báo lỗi cho BTC bằng **tiếng Việt**.
