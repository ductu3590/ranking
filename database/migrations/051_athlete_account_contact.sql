-- 051_athlete_account_contact.sql
-- Thông tin liên hệ của chính chủ tài khoản VĐV (email + số điện thoại).
-- Đặt trên athlete_accounts (liên hệ của TÀI KHOẢN) chứ không đặt trên athletes:
-- athletes là hồ sơ do CLB quản lý và được cả CLB đọc, còn email/SĐT là dữ liệu
-- riêng do chính chủ tự khai và tự sửa. Migration 003 đã cố tình bỏ phone/email
-- khỏi club_members nên không quay lại chỗ cũ.
--
-- Additive & idempotent: chỉ ADD COLUMN IF NOT EXISTS, không sửa cột sẵn có,
-- không DROP/TRUNCATE. Cột nullable nên hàng hiện hữu không cần backfill.

BEGIN;

ALTER TABLE public.athlete_accounts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS contact_updated_at timestamptz;

-- Ràng buộc định dạng đặt ở DB để dữ liệu rác không vào được kể cả khi ghi bằng
-- SQL tay. Rỗng-chuỗi bị chặn luôn: muốn xoá liên hệ thì ghi NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.athlete_accounts'::regclass
      AND conname = 'athlete_accounts_email_format'
  ) THEN
    ALTER TABLE public.athlete_accounts
      ADD CONSTRAINT athlete_accounts_email_format
      CHECK (email IS NULL OR email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.athlete_accounts'::regclass
      AND conname = 'athlete_accounts_phone_format'
  ) THEN
    -- Cùng dạng đã chuẩn hoá với tournament_registration_members.phone_norm:
    -- chỉ chữ số, bắt đầu bằng 0, dài 9–11.
    ALTER TABLE public.athlete_accounts
      ADD CONSTRAINT athlete_accounts_phone_format
      CHECK (phone IS NULL OR phone ~ '^0[0-9]{8,10}$');
  END IF;
END $$;

-- Không đặt UNIQUE trên email/phone: một gia đình dùng chung một số/hộp thư là
-- chuyện thường ở CLB phong trào, và đây không phải khoá đăng nhập (login mới là).
CREATE INDEX IF NOT EXISTS idx_athlete_accounts_email_lower
  ON public.athlete_accounts(lower(email))
  WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_athlete_accounts_phone
  ON public.athlete_accounts(phone)
  WHERE phone IS NOT NULL;

-- RLS đã bật ở 048 và không có policy nào: mọi truy cập đi qua service role.
-- Nhắc lại REVOKE cho chắc, kể cả khi ai đó từng GRANT tay.
REVOKE ALL ON TABLE public.athlete_accounts FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.athlete_accounts.email IS
  'Email liên hệ do chính chủ tài khoản VĐV tự khai; không dùng để đăng nhập.';
COMMENT ON COLUMN public.athlete_accounts.phone IS
  'SĐT đã chuẩn hoá (chỉ số, bắt đầu bằng 0) do chính chủ tự khai.';
COMMENT ON COLUMN public.athlete_accounts.contact_updated_at IS
  'Lần cuối chính chủ sửa email/SĐT.';

COMMIT;
