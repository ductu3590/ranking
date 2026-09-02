# ADR-003 — Phát triển tuần tự có phase gate

- Trạng thái: `proposed`
- Ngày: 2026-09-02

## Bối cảnh

Sáu phase phụ thuộc dữ liệu và quyền của phase trước. Làm song song dễ tạo schema, auth và UI contract mâu thuẫn.

## Quyết định

Mỗi phase có một nhánh Git riêng, Definition of Done, test evidence và xác nhận của người phụ trách sản phẩm. Chỉ sau khi merge và smoke test trên `main` mới tạo nhánh phase tiếp theo.

## Hệ quả

- Tiến độ có thể chậm hơn triển khai song song nhưng giảm rework và rủi ro dữ liệu.
- Repository ledger là bộ nhớ trạng thái bắt buộc.
