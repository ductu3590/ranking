-- 053_group_onboarding_state.sql
-- Trang thai "thiet lap CLB lan dau" cap CLB.
--
-- Nguyen tac: KHONG luu trang thai cua nhung buoc suy ra duoc tu du lieu that
-- (logo, danh sach thanh vien, QR quy, tai khoan ngan hang, giai dau) — suy ra
-- tai thoi diem doc trong app/api/club/onboarding/route.js. Chi luu 2 su kien
-- thuan UI khong suy ra duoc, ca hai deu la moc thoi gian.
--
-- Khong them onboarding_completed_at: "hoan thanh" la ham thuan cua 5 buoc suy ra
-- duoc; luu lai la tao nguon su that thu hai co the lech.
--
-- Additive & idempotent: chi ADD COLUMN IF NOT EXISTS, khong DROP/TRUNCATE.
-- groups.id la bigint (xem 007); o day khong tao bang con nen khong can FK.

BEGIN;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS onboarding_seen_at timestamptz;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at timestamptz;

COMMENT ON COLUMN public.groups.onboarding_seen_at IS
  'Lan dau truong nhom xem wizard chao mung. NULL = chua xem, app se tu mo wizard.';
COMMENT ON COLUMN public.groups.onboarding_dismissed_at IS
  'Thoi diem truong nhom bam an checklist. NULL = checklist van hien khi chua hoan tat; dat lai NULL de bat lai.';

-- CLB da van hanh truoc tinh nang nay coi nhu da xem wizard: khong lam phien ho.
-- Dieu kien "da co du lieu that" = da co thanh vien, tranh danh dau nham CLB vua tao.
UPDATE public.groups g
   SET onboarding_seen_at = COALESCE(g.onboarding_seen_at, now())
 WHERE g.onboarding_seen_at IS NULL
   AND EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.group_id = g.id);

COMMIT;
