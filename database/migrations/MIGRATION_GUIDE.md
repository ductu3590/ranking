# Database Migration Guide

## Bước 1: Chạy Migration Script

**Quan trọng:** Backup database trước khi chạy migration!

### Cách 1: Qua Supabase Dashboard (Khuyến nghị)

1. Đăng nhập vào [Supabase Dashboard](https://supabase.com/dashboard)
2. Chọn project của bạn
3. Vào **SQL Editor**
4. Copy toàn bộ nội dung file `001_add_members_and_categorization.sql`
5. Paste vào SQL Editor
6. Click **Run** để thực thi

### Cách 2: Sử dụng Supabase CLI

```bash
# Cài đặt Supabase CLI (nếu chưa có)
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Chạy migration
supabase db push
```

## Bước 2: Verify Migration

После khi chạy xong, kiểm tra:

### Kiểm tra bảng `club_members`

```sql
SELECT * FROM club_members;
```

Bạn sẽ thấy 14 thành viên đã được import.

### Kiểm tra cột mới trong `quy_pickleball`

```sql
SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_name = 'quy_pickleball';
```

Các cột mới cần có:
- `confidence_score`
- `bank_detected`
- `parsing_method`
- `loai_giao_dich`
- `huong_giao_dich`
- `is_manually_categorized`
- `admin_note`

## Bước 3: Update Existing Data (Optional)

Nếu bạn có dữ liệu cũ, có thể update giá trị mặc định:

```sql
-- Set all existing transactions to default values
UPDATE quy_pickleball
SET 
  loai_giao_dich = 'nop_quy',
  huong_giao_dich = 'in',
  confidence_score = 50,
  parsing_method = 'legacy'
WHERE 
  loai_giao_dich IS NULL;
```

## Rollback (Nếu cần)

Nếu có vấn đề, bạn có thể rollback:

```sql
-- Drop new columns
ALTER TABLE quy_pickleball 
DROP COLUMN IF EXISTS confidence_score,
DROP COLUMN IF EXISTS bank_detected,
DROP COLUMN IF EXISTS parsing_method,
DROP COLUMN IF EXISTS loai_giao_dich,
DROP COLUMN IF EXISTS huong_giao_dich,
DROP COLUMN IF EXISTS is_manually_categorized,
DROP COLUMN IF EXISTS admin_note;

-- Drop members table
DROP TABLE IF EXISTS club_members;
```

## Bước 4: Chạy Development Server

```bash
cd c:\Users\ductu\ranking
npm run dev
```

## Bước 5: Test Các Tính Năng Mới

### Test Webhook với parsing mới
1. Gửi test webhook từ SePay (hoặc dùng Postman)
2. Kiểm tra console logs
3. Verify data trong Supabase

### Test Admin Page
1. Truy cập: `http://localhost:3000/admin`
2. Test các filter
3. Test manual categorization
4. Test member management

### Test Parsing Page
1. Truy cập: `http://localhost:3000/test-parsing`
2. Thử các mẫu nội dung khác nhau
3. Kiểm tra confidence scores

## Troubleshooting

### Lỗi: Column already exists

Có thể đã chạy migration trước đó. Kiểm tra xem cột đã tồn tại chưa:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'quy_pickleball' AND column_name = 'loai_giao_dich';
```

### Lỗi: Duplicate member names

Nếu bạn đã có dữ liệu members:

```sql
-- Delete duplicates trước khi insert
DELETE FROM club_members WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY full_name ORDER BY id) as rn
    FROM club_members
  ) t WHERE rn > 1
);
```

### Lỗi: Permission denied

Đảm bảo RLS đã được tắt cho cả 2 bảng:

```sql
ALTER TABLE quy_pickleball DISABLE ROW LEVEL SECURITY;
ALTER TABLE club_members DISABLE ROW LEVEL SECURITY;
```

## Next Steps

Sau khi migration thành công:

1. ✅ Deploy lên Vercel (nếu chưa)
2. ✅ Update webhook URL trên SePay dashboard
3. ✅ Monitor transactions và confidence scores
4. ✅ Train admin sử dụng trang quản trị
5. ✅ Điều chỉnh parsing patterns nếu cần

## Support

Nếu gặp vấn đề, kiểm tra:
- Console logs trong browser (F12)
- Supabase logs trong Dashboard
- Vercel deployment logs (nếu đã deploy)
