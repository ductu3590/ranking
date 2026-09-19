-- 085 — cho phep giai DON o cap GIAI (`tournaments.entrant_type = 'individual'`).
--
-- Loi (co san tu truoc, khong phai do vong nay tao ra):
--   `lib/tournament/wizardConfig.js::unitToEntrantType('don')` tra 'individual',
--   nhung `tournaments_entrant_type_check` (migration 015) chi cho 'pair'|'team'.
--   => Tao giai DON qua wizard LUON that bai ngay o buoc 1 voi
--      "new row for relation \"tournaments\" violates check constraint
--       tournaments_entrant_type_check".
--   Truoc day wizard nuot ngoai le (`catch (_) {}`) nen van bao "Da tao giai";
--   sau khi bo nuot ngoai le (round 2) loi nay lo ra dung nhu no von la.
--
-- Tu vung phase 3 (migration 030/035) da chuan hoa 'individual' o cap NOI DUNG:
--   tournament_divisions_entrant_type_check       IN ('individual','pair','team')
--   tournament_divisions_entrant_type_relation_ck  singles <-> individual
-- Rang buoc o cap GIAI bi bo lai phia sau. Migration nay dong khoang lech do.
--
-- An toan:
--   * CHI thay mot CHECK bang mot CHECK RONG HON. Khong doi cot, khong doi du
--     lieu, khong xoa gi. Moi dong dang ton tai ('pair'/'team') van hop le tuyet
--     doi, nen buoc them rang buoc khong the that bai.
--   * `DROP CONSTRAINT` o day la thay the rang buoc, khong phai xoa du lieu.
--     Ca hai lenh nam trong MOT transaction nen khong co khoang thoi gian nao
--     bang thieu rang buoc.
--   * Idempotent: chay lai nhieu lan cho cung mot ket qua.
BEGIN;

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_entrant_type_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_entrant_type_check
  CHECK (entrant_type = ANY (ARRAY['individual'::text, 'pair'::text, 'team'::text]));

COMMIT;
