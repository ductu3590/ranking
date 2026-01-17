# Hướng dẫn Setup Authentication cho Admin

## Bước 1: Tạo User Admin trong Supabase

### Cách 1: Sử dụng Supabase Dashboard (Khuyến nghị)

1. Truy cập [Supabase Dashboard](https://supabase.com/dashboard)
2. Chọn project của bạn
3. Vào **Authentication** → **Users**
4. Click **Add user** → **Create new user**
5. Nhập thông tin:
   - **Email:** admin@example.com (hoặc email của bạn)
   - **Password:** Chọn password mạnh (ít nhất 8 ký tự)
   - **Auto Confirm User:** ✅ Bật (để không cần verify email)
6. Click **Create user**

### Cách 2: Sử dụng SQL Editor

```sql
-- Tạo user admin trực tiếp
-- QUAN TRỌNG: Thay YOUR_EMAIL và YOUR_PASSWORD
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@example.com', -- Thay email của bạn
  crypt('YourStrongPassword123', gen_salt('bf')), -- Thay password
  now(),
  now(),
  now(),
  '',
  ''
);
```

**Lưu ý:** Cách 1 (dùng Dashboard) đơn giản hơn và an toàn hơn.

---

## Bước 2: Test Login

1. Chạy dev server: `npm run dev`
2. Truy cập: http://localhost:3000/login
3. Nhập email và password đã tạo
4. Click **Đăng nhập**

Nếu thành công, bạn sẽ được redirect đến `/admin`

---

## Bước 3: Cấu hình Email (Optional)

Nếu muốn dùng tính năng reset password hoặc email verification:

1. Vào **Authentication** → **Providers** → **Email**
2. Bật **Enable Email provider**
3. Cấu hình SMTP (hoặc dùng Supabase's built-in email)

---

## Testing Checklist

- [ ] Tạo user admin trong Supabase
- [ ] Test login tại `/login`
- [ ] Verify redirect đến `/admin` sau login
- [ ] Test logout button
- [ ] Test truy cập `/admin` khi chưa login (phải redirect về `/login`)

---

## Security Notes

⚠️ **QUAN TRỌNG:**

1. **Password mạnh:** Dùng ít nhất 12 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt
2. **Không commit credentials:** File `.env.local` đã có trong `.gitignore`
3. **Production:** Nên setup email verification và 2FA
4. **Service Role Key:** Giữ bí mật, không share public

---

## Troubleshooting

### Lỗi: "Invalid login credentials"
- Kiểm tra email/password đúng chưa
- Verify user đã được tạo trong Supabase Dashboard
- Check `Auto Confirm User` đã bật

### Lỗi: "Session not found"
- Clear browser cache và cookies
- Check Supabase URL và keys trong `.env.local`
- Restart dev server

### Redirect loop
- Clear local storage: `localStorage.clear()` trong browser console
- Check authentication logic trong `admin/page.js`

---

## Thêm nhiều admins

Để thêm admin khác, lặp lại **Bước 1** với email/password mới.

Tất cả users trong Supabase Auth đều có thể login vào admin page. Nếu muốn phân quyền chi tiết hơn (admin vs moderator), cần thêm logic check role.

---

## Production Deployment

Khi deploy lên Vercel:

1. ✅ Supabase Auth tự động hoạt động
2. ✅ Không cần thêm config
3. ✅ Session được lưu trong cookies (httpOnly, secure)
4. ⚠️ Nhớ setup redirect URLs trong Supabase Dashboard:
   - Authentication → URL Configuration
   - Site URL: `https://your-domain.vercel.app`
   - Redirect URLs: `https://your-domain.vercel.app/**`
