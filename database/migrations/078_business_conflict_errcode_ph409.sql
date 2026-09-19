-- Xung dot nghiep vu KHONG duoc dung SQLSTATE 40001.
--
-- 40001 = serialization_failure. Tang PostgREST/pooler coi day la loi co the thu
-- lai va TU DONG RETRY, nen mot RAISE 40001 khong bao gio tra ve client: request
-- treo roi timeout (~120s qua Next). Do duoc bang thuc nghiem tren cung mot ham,
-- chi khac ERRCODE:
--     22023 -> 400 trong 0.27s
--     PH409 -> 400 trong 0.23s
--     40001 -> khong co phan hoi, timeout 40s
--     khong raise -> 200 trong 0.52s
-- Theo tung lop: goi SQL truc tiep tra 40001 tuc thi; goi THANG PostgREST (bo qua
-- Next) van treo => loi nam duoi Next, o tang PostgREST/pooler.
--
-- Hau qua truoc khi sua: MOI xung dot CAS/khoa (SETUP_REVISION_CONFLICT,
-- ROSTER_LOCKED, PLAYOFF_TARGET_CONFLICT, ...) deu treo thay vi tra 409.
--
-- Migration nay doi ERRCODE cua cac xung dot nghiep vu sang lop tu dinh nghia
-- 'PH409' (khong nam trong nhom duoc retry). Thong diep loi GIU NGUYEN, nen cac
-- route van nhan dien ma on dinh theo message nhu cu; route cung chap nhan ca
-- 'PH409' lan '40001' de tuong thich nguoc.
--
-- Khong doi schema, khong doi du lieu. CREATE OR REPLACE giu nguyen quyen da cap.
BEGIN;

DO $fix$
DECLARE
  r record;
  def text;
  fixed text;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) LIKE '%40001%'
    ORDER BY p.proname
  LOOP
    def := pg_get_functiondef(r.oid);
    fixed := replace(def, '''40001''', '''PH409''');
    IF position('''40001''' in fixed) > 0 THEN
      RAISE EXCEPTION 'con sot 40001 trong %', r.proname;
    END IF;
    IF fixed = def THEN
      RAISE EXCEPTION 'khong thay the duoc gi trong %', r.proname;
    END IF;
    EXECUTE fixed;
    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'khong co ham nao duoc cap nhat';
  END IF;
  RAISE NOTICE 'da cap nhat % ham', n;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) LIKE '%''40001''%'
  ) THEN
    RAISE EXCEPTION 'van con ham dung ERRCODE 40001';
  END IF;
END
$fix$;

COMMIT;
