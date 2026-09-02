# Database audits

Các file trong thư mục này là truy vấn chỉ đọc để thu bằng chứng trước/sau migration. Không dùng chúng như migration và không sửa dữ liệu để làm cho báo cáo “xanh”.

## Phase 1 schema preflight

1. Chạy `phase-1-schema-preflight.sql` trên staging bằng Supabase SQL Editor.
2. Lưu nguyên vẹn từng result set vào `docs/pickhub-core/evidence/phase-1-schema-preflight-staging.md` hoặc file đính kèm tương ứng.
3. Rà soát migration 017, rồi mới áp dụng `database/migrations/017_phase1_migration_ledger.sql` trên staging.
4. Sinh ledger local:

   ```bash
   npm run migration:ledger -- --format json --output docs/pickhub-core/evidence/phase-1-local-migration-ledger.json
   npm run migration:ledger -- --format sql --output docs/pickhub-core/evidence/phase-1-ledger-candidate.sql
   ```

5. Không chạy toàn bộ file SQL candidate một cách mặc định. Chỉ giữ các dòng migration đã xác minh thực sự được áp dụng trên môi trường đó; checksum đã ghi không được cập nhật để che giấu drift.
6. Chạy lại preflight trên production sau khi staging đạt gate tương ứng và lưu output production riêng.

Preflight chưa được xem là hoàn thành nếu chỉ có ledger local. Phase 1 cần output từ schema thật của staging và production trước exit gate.
