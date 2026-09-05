-- PickHub Phase 3: nguồn VĐV trong giải (club_member | guest).
-- Additive, forward-only. Không sửa migration đã apply.
--
-- Trước đây nguồn VĐV được SUY RA từ athlete_id (null → guest). Cách này sai khi
-- một thành viên CLB được chọn từ roster nhưng chưa có bản ghi athletes: họ có
-- athlete_id null và bị coi là khách. Cột source lưu tường minh ý định của BTC.

BEGIN;

ALTER TABLE public.tournament_athletes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'guest';

-- Backfill có kiểm soát: dữ liệu cũ có athlete_id là thành viên CLB đã map,
-- còn lại giữ mặc định guest. Chạy được cả khi bảng rỗng.
UPDATE public.tournament_athletes
SET source = 'club_member'
WHERE athlete_id IS NOT NULL AND source <> 'club_member';

ALTER TABLE public.tournament_athletes DROP CONSTRAINT IF EXISTS tournament_athletes_source_ck;
ALTER TABLE public.tournament_athletes ADD CONSTRAINT tournament_athletes_source_ck
  CHECK (source IN ('club_member', 'guest'));

COMMENT ON COLUMN public.tournament_athletes.source IS
  'club_member | guest. Lưu tường minh, không suy ra từ athlete_id: thành viên CLB chọn từ roster chưa map athletes vẫn là club_member.';

-- Verification (đọc, không thay đổi):
-- SELECT source, count(*) FROM public.tournament_athletes GROUP BY source;
-- Không được còn dòng nào ngoài club_member/guest.

COMMIT;
