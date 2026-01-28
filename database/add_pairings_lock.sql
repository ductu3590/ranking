-- Add pairings_locked setting
-- Run this in Supabase SQL Editor

INSERT INTO tournament_settings (setting_key, setting_value) 
VALUES ('pairings_locked', 'false')
ON CONFLICT (tournament_id, setting_key) DO NOTHING;

-- Verify
SELECT * FROM tournament_settings WHERE setting_key = 'pairings_locked';
