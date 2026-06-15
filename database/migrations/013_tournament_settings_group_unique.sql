-- 013: tournament_settings must be unique per (group_id, tournament_id, setting_key).
-- Fixes: (1) toggle-round1/toggle-pairings-lock upserts use onConflict
-- 'group_id,tournament_id,setting_key' but no matching unique index existed;
-- (2) multi-tenant collision where two clubs both with tournament_id=1 shared a row.

-- unique_setting exists as a CONSTRAINT (which owns its index); drop the
-- constraint first, then drop any leftover bare index of the same name.
ALTER TABLE tournament_settings
    DROP CONSTRAINT IF EXISTS unique_setting;
DROP INDEX IF EXISTS unique_setting;

CREATE UNIQUE INDEX IF NOT EXISTS unique_setting_group_tournament_key
    ON tournament_settings (group_id, tournament_id, setting_key);
