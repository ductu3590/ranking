-- 052_athlete_account_facebook_profile.sql
-- Thêm link profile Facebook vào thông tin liên hệ của chính chủ tài khoản VĐV.
-- Giữ trên athlete_accounts (cùng lớp với email/SĐT ở 051), không đặt trên athletes
-- hay roster công khai: đây là dữ liệu riêng do chính chủ tự khai để BTC giải đấu
-- xác thực VĐV khi cần, chưa mở quyền đọc cho CLB/BTC qua endpoint riêng.
--
-- Additive & idempotent: chỉ ADD COLUMN IF NOT EXISTS, không DROP/TRUNCATE.

BEGIN;

ALTER TABLE public.athlete_accounts
  ADD COLUMN IF NOT EXISTS facebook_profile_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.athlete_accounts'::regclass
      AND conname = 'athlete_accounts_facebook_profile_url_format'
  ) THEN
    -- Chỉ chấp nhận URL Facebook dạng https, có path hồ sơ.
    -- Rỗng-chuỗi bị chặn: muốn xoá thì ghi NULL.
    ALTER TABLE public.athlete_accounts
      ADD CONSTRAINT athlete_accounts_facebook_profile_url_format
      CHECK (
        facebook_profile_url IS NULL
        OR facebook_profile_url ~* '^https://(www\.|m\.)?facebook\.com/.+'
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_athlete_accounts_facebook_profile_url
  ON public.athlete_accounts(facebook_profile_url)
  WHERE facebook_profile_url IS NOT NULL;

REVOKE ALL ON TABLE public.athlete_accounts FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.athlete_accounts.facebook_profile_url IS
  'Link profile Facebook do chính chủ tự khai để BTC giải đấu xác thực VĐV; không dùng để đăng nhập và không đưa vào danh bạ công khai.';
COMMENT ON COLUMN public.athlete_accounts.contact_updated_at IS
  'Lần cuối chính chủ sửa email/SĐT/Facebook.';

COMMIT;
