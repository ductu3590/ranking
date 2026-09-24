# Lát E3 — Trang công khai (VĐV + khán giả)

Trạng thái: spec · Phụ thuộc: E1 (`matchLabels`), E2 (`BracketView`, `StandingsView`) · Xem [README](README.md)
Thiết kế: `canonical/operations/07-public-live/reference-390` (D30: giữ 4 tab).

## 1. Mục tiêu

Người xem ở sân mở link trên điện thoại là biết ngay: sân nào đang đá gì, trận của mình khi nào, ai đi tiếp.
Học từ Sportix (thẻ trận dễ đọc, sơ đồ cuộn ngang theo vòng, chú giải BXH) và tránh lỗi của họ (header chiếm cả màn,
nhãn không thống nhất, bye hiện như trận chờ, đã kết thúc mà không có kết quả).

## 2. Cấu trúc trang `app/giai-dau/v2/[slug]`

- **Header gọn** (≤ 1/3 màn 390px): tên CLB, tên giải, chip trạng thái, ngày · địa điểm, thanh tiến độ `x/y trận đã xong`,
  nút `Chia sẻ` (dùng `ShareActions`). Không poster lớn.
- **Chọn nội dung** ngay dưới header khi giải có > 1 nội dung (segmented; không chuyển trang). Trang
  `noi-dung/[division]` giữ để link cũ không vỡ, render cùng component với nội dung được chọn sẵn; division không
  thuộc giải → **giữ hành vi báo không tồn tại hiện tại**, không render tab rỗng.
- **4 tab dính** (D30): `Trực tiếp` · `Lịch` · `Xếp hạng` · `Sơ đồ`. Tab mặc định: `Trực tiếp` khi giải đang diễn ra;
  `Xếp hạng` khi đã kết thúc (bục 1–2–3 ở đầu); `Lịch` khi chưa bắt đầu. Tab chọn lưu trong `?tab=`.
- Tab `Sơ đồ` hiện **khi và chỉ khi** nội dung đang chọn có ít nhất một stage `schedule_format ∈ {knockout, double_elim}`
  (vòng bảng có playoff → hiện; vòng tròn thuần / vòng bảng không playoff → ẩn). Điều kiện theo stage, không theo tên
  thể thức.

## 3. Nội dung từng tab

| Tab | Nội dung |
|---|---|
| Trực tiếp | **Đang đấu** theo sân (`Sân 01 · Bảng A · Lượt 3`, hai cặp, chip `Đang đấu · 12 phút` từ `started_at`, ván đã lưu nếu có); **Sắp tới** (trận `Chưa gọi` đủ cặp theo giờ dự kiến + trận chờ nguồn `Thắng Bán kết 1 vs Thắng Bán kết 2`); **Vừa xong** (5 trận, cặp thắng đậm, tỉ số) |
| Lịch | Danh sách theo lượt, cùng nhãn `matchLabel` với console; lọc giai đoạn |
| Xếp hạng | `StandingsView` (chú giải cột, tiêu chí; bục khi đã kết thúc) |
| Sơ đồ | `BracketView` **không truyền `onSelectMatch`** (E2 §2) — chỉ đọc, mobile cuộn ngang theo vòng |

Không có: link trọng tài, số điểm từng pha, tìm tên VĐV (ngoài phạm vi D30 — ghi backlog).

## 4. API công khai `GET /api/tournament-v2/public`

Bổ sung (chỉ đọc, không lộ dữ liệu cá nhân ngoài tên đã hiển thị hiện nay):
- Trường trận: `match_key`, `warmup_started_at`, `started_at`, `ended_at`.
- `sources`: danh sách `{ target_match_id, target_slot, source_kind, source_outcome, source_match_id, group_label,
  rank }` từ `tournament_stage_transitions` của các stage công khai (để hiện ô chờ theo nguồn).
- `schedule`: `{ matchId, court, projectedStart }` cho trận chưa gọi (dùng `projectSchedule`; không trả assignment
  nội bộ khác).
Giữ cache/polling hiện có (`nextPollingDelay`, làm mới khi focus).

## 5. Test

| File | Khóa |
|---|---|
| `public-snapshot.test.js` | Select công khai có `match_key` + mốc giờ; `sources`/`schedule` không chứa cột nhạy cảm (số điện thoại, member id nội bộ, token) |
| `public-ui.test.js` | Đúng 4 tab + mặc định theo trạng thái; không nút quản trị, không import `saveGames`/`transitionMatch`/`withdraw`/`corrections`, `BracketView` không nhận `onSelectMatch`; `Sơ đồ` hiện với vòng bảng có playoff, ẩn với vòng tròn thuần và vòng bảng không playoff; nhóm Tranh hạng ba theo `match_key`; header không có ảnh poster; division lạ → không tồn tại |

Test `tests/tournament/ui-public.contract.test.js` / `api-public.contract.test.js` sửa theo → ghi ADR-006.
