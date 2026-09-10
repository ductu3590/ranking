-- 049_stage_entrants_entry_based.sql
-- Migration 033 thêm entry_id/division_id vào tournament_stage_entrants cho luồng
-- division/entry, nhưng để nguyên NOT NULL trên cột entrant_id cũ. Hậu quả: chốt
-- bốc thăm cho giải tạo bằng wizard (có division_id) luôn vỡ với
-- 'null value in column "entrant_id" ... violates not-null constraint',
-- tức là không sinh được lịch thi đấu.
-- Migration này chỉ nới ràng buộc, không xoá/đổi dữ liệu nào.

ALTER TABLE public.tournament_stage_entrants
  ALTER COLUMN entrant_id DROP NOT NULL;

-- Một dòng phải trỏ tới đúng một trong hai nguồn đội: entrant (luồng cũ) hoặc
-- entry (luồng division). Mọi dòng đang có đều là entrant nên check này pass ngay.
ALTER TABLE public.tournament_stage_entrants
  DROP CONSTRAINT IF EXISTS tournament_stage_entrants_source_ck;
ALTER TABLE public.tournament_stage_entrants
  ADD CONSTRAINT tournament_stage_entrants_source_ck
  CHECK (entrant_id IS NOT NULL OR entry_id IS NOT NULL);

-- idx_stage_entrants_unique(group_id, stage_id, entrant_id) không chặn trùng khi
-- entrant_id NULL, nên luồng entry cần index riêng.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_entrants_entry_unique
  ON public.tournament_stage_entrants(group_id, stage_id, entry_id)
  WHERE entry_id IS NOT NULL;

COMMENT ON COLUMN public.tournament_stage_entrants.entrant_id IS 'Luồng cũ (tournament_entrants). NULL khi giai đoạn chạy theo division/entry';
COMMENT ON COLUMN public.tournament_stage_entrants.entry_id IS 'Luồng division (tournament_entries). NULL khi giai đoạn chạy theo entrant cũ';
