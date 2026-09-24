# Operations Screens (Epic 2 — Bàn điều hành)

Sinh trực tiếp qua Stitch connector ngày 2026-09-24, project `16224817196221939744`, design system
`Pro Court OS` (sáng, asset `ca3eeb22ca9e4f738817511ae0f13aae`, khớp `../DESIGN.md`).
Brief: `_workspace/epic-2-operations/01_stitch_brief.md`. Hash + screen ID: `manifest.json`.

| Key | Stitch screen ID | Nội dung |
|---|---|---|
| `01-control-center/reference` | `ec17ef7d2c4845c1b99d6fc75bd27542` | Trung tâm điều hành 1280: dải tiến độ, lưới thẻ sân, hàng chờ theo lượt, trận vừa chốt |
| `01-control-center/reference-390` | `44de736709fb41389f93febcba2e0b0d` | Bản 390: thẻ sân dọc, segmented `Sân · Hàng chờ · Vừa chốt` |
| `02-call-card/reference` | `62873a9b955142a4b44b6ed87637af70` | Thẻ gọi sân (đọc mic), đổi sân, "Đã gọi — bắt đầu khởi động" |
| `03-score-entry/reference` | `8ef3c079f84d40aaac8f8397ffdd140b` | Nhập tỉ số desktop + banner xung đột phiên bản + hộp xác nhận rời trang |
| `03-score-entry/reference-390` | `74de019abd3d4ea78e81596b0696e81e` | Bottom sheet BO3, lỗi "phải cách 2 điểm", nút chốt khoá khi sai |
| `04-schedule-results/reference` | `f0c1bb0dadf64f80ae4479d4e3413ff8` | Lịch & kết quả theo lượt, ô chờ theo nguồn, không có ô BO theo vòng |
| `05-bracket/reference-knockout` | `b3225ac23fdc4fd9bf833873911dd929` | Sơ đồ loại trực tiếp, bye `Miễn đấu`, `Tranh hạng ba` tách khỏi Chung kết |
| `05-bracket/reference-double-elim` | `cf055aeb4bd84a8095525f631b2ce049` | Sơ đồ loại kép: Nhánh thắng / Nhánh thua / Chung kết tổng |
| `06-standings-finish/reference` | `63aa855d71c7487ba1e091f03b8ef439` | BXH vòng bảng, xếp hạng chung cuộc, "Kết thúc giải & chốt xếp hạng" |
| `07-public-live/reference-390` | `ae763f78319a48718b7deac5507b416b` | Trang công khai VĐV: Trực tiếp / Lịch / Xếp hạng / Sơ đồ |

OPS-08 (link trọng tài) chưa thiết kế — chưa quyết định đưa vào Epic 2.

## Lưu ý khi code (thiết kế ≠ nghiệp vụ; spec/ADR thắng)

- Quy tắc chung của `../README.md` vẫn áp dụng: không chép Tailwind/CDN, dùng dữ liệu thật, tiếng Việt.
- Không có chấm điểm từng pha: mọi số trên thẻ sân/ô sơ đồ đang đấu là **ván đã lưu**, không phải điểm live.
- Các câu Stitch tự thêm mà hệ thống không có thì bỏ: "ứng dụng trọng tài", "chứng thực tự động",
  "In sơ đồ / In lịch" (chỉ làm nếu spec chốt), "Tự động cập nhật" chỉ khi có polling thật.
- `05-bracket/reference-double-elim`: ảnh **thiếu cột `Chung kết nhánh thua` (LF)** trong khung Nhánh thua và nút
  `WF` bị cắt mép phải — khi code phải đủ cột LF (nguồn: thắng vòng thua cuối + thua WF), nhãn đúng D21, hạng theo D22.
- `02-call-card`: nút "Để sau" bị xuống dòng — giữ một dòng.
- Mã trận hiển thị (M13, BK1, H3, W1-2…) chỉ là gợi ý; nhãn chính luôn là tên vòng tiếng Việt.
- Ảnh demo dùng dữ liệu giả (tên VĐV, giờ, số trận); nút `Lưu nháp` phụ thuộc API lưu một phần ván (đã có:
  lưu khi chưa đủ điều kiện kết thúc trận).

Các bản trung gian (trước khi sửa) vẫn nằm trong project Stitch; bản chuẩn là các ID trong bảng trên.
