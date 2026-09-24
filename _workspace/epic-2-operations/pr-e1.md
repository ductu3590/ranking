# PR nháp — Epic 2 lát E1

Tiêu đề: `Epic 2 lát E1: bàn điều hành 4 mục + mục Điều hành + chặn dữ liệu trận`
Nhánh: `claude/epic-2-deployment-29420b` → `main` (tạo ở dạng Draft)

## Tóm tắt

Lát E1 của Epic 2 (spec `docs/superpowers/specs/2026-09-24-epic-2-operations/`, ADR-007 D25–D33). **Không migration.**

- **Bàn điều hành 4 mục** (D29): Điều hành · Trận đấu · Sơ đồ & xếp hạng · Cài đặt; mobile có thanh tab đáy. Mọi link cũ (`?step=` / `?tab=`) vẫn có đích.
- **Mục Điều hành** (Stitch OPS-01/02/03): thẻ sân theo trạng thái, gợi ý trận kế tiếp, hàng chờ theo lượt với nút "Gọi vào sân…" (D33), thẻ đọc mic, sheet nhập tỉ số kiểm luật tại chỗ, banner xung đột phiên bản, chặn rời trang khi chưa lưu.
- **Nhãn trận dùng chung** (`lib/tournament/matchLabels.js`): tên vòng tiếng Việt, ô chờ ghi nguồn — không còn "Đội A/Đội B", "Trận #id".
- **Chặn dữ liệu trận** (nguyên nhân gốc lỗi "Dữ liệu trận đã thay đổi" của Epic 1):
  - `POST /games`: từ chối trận đã chốt, thiếu cặp, không có ván, lưu dở khi chưa bắt đầu; lưu nháp giữ trạng thái; phân loại lỗi theo message (`PH409`); `ended_at` có điều kiện.
  - `POST /withdraw` (RPC 096): W.O. khi khởi động, bỏ cuộc khi đang đấu/tạm dừng.
  - `POST /match-transition`: bỏ chốt trận không tỉ số; gọi sân kiểm cặp/sân bận.
- Gỡ `ControlStep`; `ResultsTab` stage v4 không còn ô chọn BO theo lượt.
- Đã sửa trận GF id 1469 ("Nhanhthangthua") về `pending` (người dùng đồng ý) — xem `evidence.md`.

## Kiểm thử

- `tests/stitch-setup/epic-2/*`: 44/44. `npm run test:tournament`, `test:open-registration`: xanh (6 test khóa chuỗi cũ sửa, ADR-006 mục Epic 2). `npx next build`: OK.
- Xem trước tạm 1280px + 375px (đã xoá). Đỏ từ trước, ngoài PR: `phase2/validated-mutation-guard`, `phase3/wizard-redesign-contract`; `stitch-setup/epic-1/ui-contract` chỉ đỏ trên Windows (CRLF).

## Cần người dùng trước khi merge (D27)

Chạy thật trên CLB 59: K1 (vòng bảng → loại trực tiếp, có W.O., chung kết BO3), K2 (loại kép tới Chung kết tổng), K3 (vòng tròn), K4 (hai máy cùng sửa một trận). Giải chưa có sân trong "Cài đặt" thì mục Điều hành hiện "Chưa khai báo sân nào".

🤖 Generated with [Claude Code](https://claude.com/claude-code)
