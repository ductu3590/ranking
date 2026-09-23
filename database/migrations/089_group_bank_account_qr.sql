-- PickHub: du lieu de PickHub tu sinh ma QR nhan quy tu tai khoan da khai bao.
-- Additive, forward-only. Khong sua migration da apply.
BEGIN;

ALTER TABLE public.group_bank_accounts ADD COLUMN IF NOT EXISTS bank_code text;
ALTER TABLE public.group_bank_accounts ADD COLUMN IF NOT EXISTS bank_bin text;
ALTER TABLE public.group_bank_accounts ADD COLUMN IF NOT EXISTS account_holder text;

COMMENT ON COLUMN public.group_bank_accounts.bank_code IS
  'Ten ngan cua ngan hang theo chuan VietQR (vd MBBank, Vietcombank).';
COMMENT ON COLUMN public.group_bank_accounts.bank_bin IS
  'Ma BIN NAPAS 6 so — tham so bank khi goi qr.sepay.vn/img hoac vietqr.app/img.';
COMMENT ON COLUMN public.group_bank_accounts.account_holder IS
  'Ten chu tai khoan hien tren anh QR. Khong bat buoc.';

COMMIT;
