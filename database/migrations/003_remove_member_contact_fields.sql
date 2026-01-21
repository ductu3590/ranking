-- Migration: Remove phone and email columns from club_members
-- Created: 2026-01-21
-- Description: Remove unnecessary contact fields (phone, email) from club_members table

-- ============================================================
-- 1. DROP PHONE AND EMAIL COLUMNS
-- ============================================================

ALTER TABLE club_members 
DROP COLUMN IF EXISTS phone;

ALTER TABLE club_members 
DROP COLUMN IF EXISTS email;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
