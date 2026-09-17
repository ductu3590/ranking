-- 054_sepay_connection_state.sql
-- Trang thai ket noi SePay cap CLB.
--
-- Bo sung so voi ban thiet ke dau: SePay co san chuc nang "Gui thu" (menu ⋮ tren
-- dong webhook). Tai lieu SePay mo ta no gui mot PAYLOAD MAU, vi du dung so tai
-- khoan mau 1017588888 -> KHONG the dung no de tu phat hien so tai khoan.
-- Vi vay admin xac nhan so tai khoan o buoc 1 (ho biet so nay), con "Gui thu"
-- lam dung viec no lam tot: chung minh duong ong chay that, ma khong ai phai
-- chuyen tien that.
--
-- Nho do KHONG con: bang sepay_pairing_sessions, RPC complete_sepay_pairing,
-- ma ghep noi trong noi dung chuyen khoan, giao dich thu 2.000d va cot
-- quy_pickleball.is_pairing_probe. Chi con ba cot tren groups.
--
-- Additive & idempotent. groups.id la bigint (xem 007).

BEGIN;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS sepay_verify_until timestamptz;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS sepay_last_signal_at timestamptz;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS sepay_verify_hint text;

COMMENT ON COLUMN public.groups.sepay_verify_until IS
  'Han cua so kiem tra ket noi (~10 phut). NULL hoac da qua = khong trong che do kiem tra.';
COMMENT ON COLUMN public.groups.sepay_last_signal_at IS
  'Lan cuoi /api/webhook nhan request co chu ky HMAC hop le cua CLB nay. Dung cho the "suc khoe ket noi".';
COMMENT ON COLUMN public.groups.sepay_verify_hint IS
  'Goi y chan doan hien cho admin, vd nhan duoc tin hieu nhung chu ky khong khop.';

-- Webhook tra cac CLB dang mo cua so kiem tra tren moi request khong khop tai
-- khoan nao. N rat nho (thuong 0-2) nhung index giu cho no khong thanh seq-scan
-- khi bang groups lon dan.
CREATE INDEX IF NOT EXISTS idx_groups_sepay_verifying
  ON public.groups (sepay_verify_until)
  WHERE sepay_verify_until IS NOT NULL;

COMMIT;
