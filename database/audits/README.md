# Database audits

Các file trong thư mục này là truy vấn chỉ đọc để thu bằng chứng trước/sau migration. Không dùng chúng như migration và không sửa dữ liệu để làm cho báo cáo “xanh”.

## Phase 1 schema preflight

1. Chạy `phase-1-schema-preflight.sql` trên staging trước; sau khi rollout thủ công
   thì chạy lại trên production bằng Supabase SQL Editor.
2. Lưu nguyên vẹn từng result set vào evidence riêng của môi trường, ví dụ
   `docs/pickhub-core/evidence/phase-1-schema-preflight-staging.md` và
   `docs/pickhub-core/evidence/phase-1-schema-preflight-production.txt`.
3. Rà soát migration 017, rồi mới áp dụng `database/migrations/017_phase1_migration_ledger.sql` trên staging.
4. Sinh ledger local:

   ```bash
   npm run migration:ledger -- --format json --output docs/pickhub-core/evidence/phase-1-local-migration-ledger.json
   npm run migration:ledger -- --format sql --output docs/pickhub-core/evidence/phase-1-ledger-candidate.sql
   ```

5. Không chạy toàn bộ file SQL candidate một cách mặc định. Chỉ giữ các dòng migration đã xác minh thực sự được áp dụng trên môi trường đó; checksum đã ghi không được cập nhật để che giấu drift.
6. Khi đã xác minh các migration Phase 1 đã chạy trên production, dùng
   `phase-1-register-applied-ledger.sql` để ghi nhận **chỉ** các migration đã áp
   dụng. Script này có kiểm tra checksum/version và không chạy DDL.
   Sau khi migration 025 được áp dụng, dùng riêng
   `phase-1-register-025-ledger.sql` để ghi nhận version 25.
   Migrations 026–027 có script đăng ký tương ứng sau khi đã chạy DDL.
7. Chạy lại preflight trên production sau khi staging đạt gate tương ứng và lưu output production riêng.

Migration 025 có compatibility trigger để bản PickHub production hiện tại (chưa
gửi `member_group_id`) vẫn ghi được member hợp lệ trong thời gian rollout.

Preflight chưa được xem là hoàn thành nếu chỉ có ledger local. Phase 1 cần output từ schema thật của staging và production trước exit gate.
