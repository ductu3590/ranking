# Migration Guide cho Ranking Snapshots

## Bước 1: Chạy Migration trên Supabase

1. Truy cập [Supabase Dashboard](https://supabase.com/dashboard)
2. Chọn project Pickleball của bạn
3. Vào **SQL Editor** (biểu tượng ở sidebar bên trái)
4. Copy toàn bộ nội dung của file `002_add_ranking_snapshots.sql`
5. Paste vào SQL Editor và nhấn **Run** (hoặc Ctrl+Enter)

## Bước 2: Verify Migration

Chạy SQL sau để kiểm tra bảng đã được tạo:

```sql
-- Kiểm tra bảng đã tồn tại
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'ranking_snapshots';

-- Kiểm tra cấu trúc bảng
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ranking_snapshots';

-- Kiểm tra indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'ranking_snapshots';
```

## Bước 3: Tạo Snapshot Đầu Tiên (Optional - dữ liệu test)

Để test tính năng, bạn có thể tạo snapshot thủ công:

```sql
-- Tạo snapshot ngày hôm qua để có dữ liệu so sánh
INSERT INTO ranking_snapshots (nguoi_nop, rank_position, total_amount, snapshot_date)
VALUES 
  ('TUAN', 2, 500000, CURRENT_DATE - INTERVAL '1 day'),
  ('HUNG', 1, 800000, CURRENT_DATE - INTERVAL '1 day'),
  ('NAM', 3, 300000, CURRENT_DATE - INTERVAL '1 day'),
  ('DUONG', 4, 250000, CURRENT_DATE - INTERVAL '1 day')
ON CONFLICT (nguoi_nop, snapshot_date) DO NOTHING;
```

## Bước 4: Test API Endpoint

```bash
# Test lưu snapshot hiện tại
curl -X POST http://localhost:3000/api/save-snapshot

# Test xem snapshot đã lưu
curl http://localhost:3000/api/save-snapshot
```

## Bước 5: Deploy lên Vercel

Sau khi test thành công local:

```bash
git add .
git commit -m "feat: add leaderboard history with rank change indicators"
git push origin main
```

Vercel sẽ tự động deploy và cron job sẽ chạy mỗi ngày lúc 00:00 UTC.

## Troubleshooting

### Lỗi: constraint violation
- Kiểm tra xem đã có dữ liệu duplicate trong bảng chưa
- Xóa duplicate: `DELETE FROM ranking_snapshots WHERE ...`

### Lỗi: function not found
- Kiểm tra migration đã chạy thành công chưa
- Re-run migration nếu cần

### Cron job không chạy
- Cần Vercel Pro plan để dùng cron jobs
- Hoặc dùng external cron service như cron-job.org để gọi API
