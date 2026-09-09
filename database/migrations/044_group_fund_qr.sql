-- PickHub: anh QR nhan quy cua CLB.
-- Additive, forward-only. Khong sua migration da apply.
--
-- QR chi la anh de thanh vien quet, khong co logic kem theo. Viec ghi nhan tien vao
-- van hoan toan do webhook SePay dam nhiem qua group_bank_accounts.account_number.

BEGIN;

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS fund_qr_url text;

COMMENT ON COLUMN public.groups.fund_qr_url IS
  'Anh QR nhan quy luu dang data-URL PNG (<=200KB). Chi hien thi cho phien CLB hop le, khong phoi bay qua /api/club/branding.';

COMMIT;
