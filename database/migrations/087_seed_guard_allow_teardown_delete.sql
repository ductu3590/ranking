-- 087 — guard E5 khong duoc chan viec XOA GIAI.
--
-- Loi (do chinh buoc don du lieu kiem thu cua round 4 phat hien):
--   Trigger `trg_tournament_games_group_seed_guard` (migration 077, siet them o
--   080) dat tren `BEFORE INSERT OR UPDATE OR DELETE`. Vi vay MOI lenh xoa
--   `tournament_games` cua mot giai da seed play-off deu bi raise
--   `GROUP_CORRECTION_BLOCKED_QUALIFICATION_SEEDED`.
--   Hau qua tren san pham: BTC KHONG XOA DUOC mot giai da vao play-off — ke ca
--   bang chinh nut "Xoa giai" tren giao dien. Xoa `tournament_matches` thi khong
--   bi chan (trigger o bang do chi dat tren UPDATE), nen rang buoc hien tai vua
--   thua vua thieu, va khong nhat quan.
--
-- Sua: bo DELETE khoi pham vi trigger tren `tournament_games`, giu INSERT va UPDATE.
--
-- Vi sao viec nay KHONG lam yeu E5:
--   Moi duong DOI KET QUA deu phai GHI game moi — `replace_tournament_games`
--   (va ban `_with_transitions`) xoa roi CHEN lai, con
--   `apply_tournament_result_correction_graph_aware` cung chen game moi. Buoc
--   CHEN van bi trigger chan, va vi tat ca nam trong CUNG mot transaction nen
--   ca thao tac bi huy — y het nhu truoc. Chi con mot truong hop duoc mo ra:
--   xoa game ma KHONG chen lai, tuc la thao do giai/giai doan, chu khong phai
--   sua ket qua.
--   Trigger tren `tournament_matches` (BEFORE UPDATE) giu nguyen, khong dung toi.
--
-- Khong doi schema, khong doi du lieu, khong DROP/TRUNCATE bang nao. Idempotent.
BEGIN;

DROP TRIGGER IF EXISTS trg_tournament_games_group_seed_guard ON public.tournament_games;
CREATE TRIGGER trg_tournament_games_group_seed_guard
  BEFORE INSERT OR UPDATE ON public.tournament_games
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_result_change_after_seed();

DO $check$
DECLARE v_type smallint;
BEGIN
  SELECT t.tgtype INTO v_type
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE t.tgname = 'trg_tournament_games_group_seed_guard' AND c.relname = 'tournament_games';
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'khong tim thay trigger sau khi tao lai';
  END IF;
  IF (v_type & 8) <> 0 THEN
    RAISE EXCEPTION 'trigger van con bat DELETE';
  END IF;
  IF (v_type & 4) = 0 OR (v_type & 16) = 0 THEN
    RAISE EXCEPTION 'trigger phai giu ca INSERT va UPDATE';
  END IF;
END
$check$;

COMMIT;
