-- Update Round 1 reveal time to today at 16:30
UPDATE tournament_settings
SET setting_value = '"2026-01-28T16:30:00+07:00"'::jsonb,
    updated_at = NOW()
WHERE tournament_id = 1 
  AND setting_key = 'round1_reveal_time';

-- Verify the update
SELECT setting_key, setting_value, updated_at 
FROM tournament_settings 
WHERE setting_key = 'round1_reveal_time';
