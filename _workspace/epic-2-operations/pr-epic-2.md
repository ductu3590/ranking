# Epic 2: Tối ưu điều hành giải (E1 · E1.1 · E2 · E3)

Spec: `docs/superpowers/specs/2026-09-24-epic-2-operations/` · Quyết định: ADR-007 D25–D37 · Bằng chứng: `_workspace/epic-2-operations/evidence.md`.
Người dùng nghiệm thu từng lát trên CLB 59: **E1 (quy trình), E1.1, E2, E3 đều PASS**.

## Tóm tắt

- **E1 — Điều hành**: bàn điều hành 4 mục (Điều hành · Trận đấu · Sơ đồ & xếp hạng · Cài đặt), thẻ sân, hàng chờ theo lượt, thẻ gọi sân, sheet nhập tỉ số; chặn các đường làm hỏng dữ liệu trận. Tạo giải: gõ được dấu cách, Bước 3 ghép cặp trước + số sân có gợi ý, chốt giải → "Chờ diễn ra" + tự tạo sân (migration 109).
- **E1.1 — sửa sau nghiệm thu**: luật điểm "bên nhiều điểm hơn thắng" (D34); chốt vòng bảng / kết thúc giải ngay trong Điều hành (D35); kết thúc giải chuyển giải sang "Đã kết thúc" (D36); giao diện Điều hành sát Stitch.
- **E2 — Trận đấu · Sơ đồ & xếp hạng · Cài đặt** theo Stitch OPS-04/05/06/08: lọc trận, "Sửa kết quả" qua corrections, sơ đồ loại trực tiếp / loại kép dùng chung, xếp hạng + bục, link công khai (tự sinh slug khi bật), sân, nhật ký dạng câu. Không có "Huỷ chốt lịch" cho giải v4 (D37).
- **E3 — Trang công khai** 4 tab (Trực tiếp · Lịch · Xếp hạng · Sơ đồ) theo Stitch OPS-07, không vỏ app CLB; API công khai trả `board` đã lọc trường.

Giải cũ (không phải setup v4) và MLP giữ nguyên giao diện cũ.

## Database

Migration `109_prepare_tournament_after_finalize.sql` **đã apply** lên production (2026-09-24, chạy thử ROLLBACK trước, md5 thân hàm khớp file). Không migration nào khác.

## Kiểm thử

- `tests/stitch-setup/epic-2/*`: e1-1 7/7, e2-contract 7/7, e3-public 6/6, board/labels/score-entry/api-contract/ui-contract/setup-followup xanh.
- `npm run test:stitch-setup` xanh trừ `epic-1/ui-contract` (đỏ trên Windows do CRLF, có từ trước).
- `test:tournament`, `test:open-registration`, `test:phase1`, `test:mobile-nav`, `test:ph-ui`, `phase3/share`, `phase3/scoring-rules` xanh. Sửa test khóa chuỗi cũ: ADR-006 mục Epic 2 / E1.1 / E2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
