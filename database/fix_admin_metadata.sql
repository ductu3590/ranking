-- Bước 1: Kiểm tra email admin của bạn (thay 'admin@example.com' bằng email thật)
SELECT id, email, raw_user_meta_data 
FROM auth.users 
WHERE email = 'admin@example.com';  -- THAY EMAIL CỦA BẠN

-- Bước 2: Cập nhật metadata để set role = 'admin'
-- Sau khi đã xác nhận email ở Bước 1, chạy query này:
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"admin"'
)
WHERE email = 'admin@example.com';  -- THAY EMAIL CỦA BẠN

-- Bước 3: Xác nhận lại (kiểm tra xem đã cập nhật chưa)
SELECT id, email, raw_user_meta_data 
FROM auth.users 
WHERE email = 'admin@example.com';  -- THAY EMAIL CỦA BẠN
