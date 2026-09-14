-- Migration 045: Groups venue and flexible code length
-- Allow clubs to specify their home venue / courts and choose a custom club code (3-16 chars)

ALTER TABLE public.groups
    ADD COLUMN IF NOT EXISTS venue text;

COMMENT ON COLUMN public.groups.venue IS 'Sân sinh hoạt chính / địa bàn của CLB';

-- Relax groups_code_length constraint to support custom club codes between 3 and 16 characters
ALTER TABLE public.groups
    DROP CONSTRAINT IF EXISTS groups_code_length;

ALTER TABLE public.groups
    ADD CONSTRAINT groups_code_length CHECK (char_length(code) BETWEEN 3 AND 16);
