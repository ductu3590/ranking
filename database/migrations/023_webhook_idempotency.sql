-- PickHub Phase 1: make financial webhook retries idempotent.
-- The webhook already handles a duplicate-key response; this migration adds
-- the key it relies on, scoped to the receiving club.

DO $$
BEGIN
  IF EXISTS (
    SELECT group_id, lower(btrim(ma_giao_dich))
    FROM public.quy_pickleball
    WHERE ma_giao_dich IS NOT NULL
      AND btrim(ma_giao_dich) <> ''
    GROUP BY group_id, lower(btrim(ma_giao_dich))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot harden webhook idempotency: duplicate transaction references exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quy_pickleball_group_transaction
  ON public.quy_pickleball(group_id, lower(btrim(ma_giao_dich)))
  WHERE ma_giao_dich IS NOT NULL
    AND btrim(ma_giao_dich) <> '';

COMMENT ON INDEX public.idx_quy_pickleball_group_transaction IS
  'One normalized bank transaction reference per club; webhook retries replay as duplicate-key';
