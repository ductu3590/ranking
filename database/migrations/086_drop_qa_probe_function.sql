-- 086 — don sach ham probe QA con sot trong LICH SU migration.
--
-- Boi canh: khi truy nguyen nguyen nhan treo request (migration 078), mot ham
-- probe tam `public.qa_probe_raise(text)` da duoc tao qua `apply_migration`, nen
-- no VAO LEDGER voi ten `qa_probe_errcode_behaviour` (20260919005537). Ham do
-- da duoc DROP khoi database dang chay ngay sau khi do xong — nhung ledger thi
-- van giu lai buoc tao no.
--
-- Hau qua neu khong sua: dung ledger de dung mot database MOI (staging, khoi
-- phuc, ban sao) se TAI TAO ham probe do. No la SECURITY DEFINER va khong he
-- REVOKE quyen, nen tren ban sao moi `anon`/`authenticated` se goi duoc mot ham
-- chay bang quyen chu so huu. Day la khoang trong ve bao mat chi lo ra khi
-- replay, khong nhin thay tren database hien tai.
--
-- Cach sua: forward-only. KHONG sua/xoa dong ledger cu (khong bao gio viet lai
-- lich su da deploy); thay vao do them mot buoc sau cung de don.
--
-- Pham vi: chi dung toi ham co tien to `qa_probe_`. Khong dung toi bang, khong
-- dung toi du lieu, khong DROP/TRUNCATE gi khac. Idempotent.
BEGIN;

DROP FUNCTION IF EXISTS public.qa_probe_raise(text);
DROP FUNCTION IF EXISTS public.qa_dump_migration(text);

DO $check$
DECLARE v_left integer;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'qa\_%';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'van con % ham qa_* trong schema public', v_left;
  END IF;
END
$check$;

COMMIT;
