# Test evidence

Thư mục này lưu báo cáo kiểm thử dùng để xác nhận từng phase. Báo cáo chỉ được tạo khi phase tương ứng chuyển sang `awaiting_approval`.

Tên file bắt buộc:

- `phase-1-test-report.md`
- `phase-2-test-report.md`
- `phase-3-test-report.md`
- `phase-4-test-report.md`
- `phase-5-test-report.md`
- `phase-6-test-report.md`

Mỗi báo cáo phải có các mục: phạm vi, branch/commit, môi trường, lệnh test và exit code, migration verification, authorization/RLS, concurrency, E2E, known limitations, release/rollback check và kết luận PASS hoặc FAIL.

Không commit secret, token, dữ liệu cá nhân hoặc raw production dump vào evidence.
