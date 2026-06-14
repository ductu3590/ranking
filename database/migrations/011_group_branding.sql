-- Phase 4: per-club branding. A nullable data-URL logo; the club display name
-- reuses groups.name. Additive + nullable → safe to apply before code deploy.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN groups.logo_url IS 'Logo CLB lưu dạng data-URL (đã nén ≤256px) hiển thị trên header';
