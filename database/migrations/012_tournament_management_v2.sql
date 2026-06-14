-- Tournament management v2: per-club tournament format and assignment config.

ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS tournament_format text NOT NULL DEFAULT 'mlp_team',
    ADD COLUMN IF NOT EXISTS assignment_mode text NOT NULL DEFAULT 'random',
    ADD COLUMN IF NOT EXISTS team_size integer NOT NULL DEFAULT 4,
    ADD COLUMN IF NOT EXISTS teams_per_match integer NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tournaments
    DROP CONSTRAINT IF EXISTS tournaments_format_check,
    DROP CONSTRAINT IF EXISTS tournaments_assignment_mode_check,
    DROP CONSTRAINT IF EXISTS tournaments_team_size_check,
    DROP CONSTRAINT IF EXISTS tournaments_teams_per_match_check;

ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_format_check
        CHECK (tournament_format IN ('mlp_team', 'doubles_round_robin', 'group_playoff', 'knockout')),
    ADD CONSTRAINT tournaments_assignment_mode_check
        CHECK (assignment_mode IN ('random', 'balanced', 'manual', 'strong_weak')),
    ADD CONSTRAINT tournaments_team_size_check
        CHECK (team_size BETWEEN 2 AND 12),
    ADD CONSTRAINT tournaments_teams_per_match_check
        CHECK (teams_per_match BETWEEN 2 AND 8);

ALTER TABLE tournament_teams
    DROP CONSTRAINT IF EXISTS tournament_teams_team_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_teams_group_tournament_code
    ON tournament_teams(group_id, tournament_id, team_code);

CREATE INDEX IF NOT EXISTS idx_tournaments_group_status
    ON tournaments(group_id, status);

COMMENT ON COLUMN tournaments.tournament_format IS 'Tournament format: mlp_team, doubles_round_robin, group_playoff, knockout';
COMMENT ON COLUMN tournaments.assignment_mode IS 'Team/pair assignment mode: random, balanced, manual, strong_weak';
COMMENT ON COLUMN tournaments.scoring_config IS 'JSON scoring/rules configuration for this tournament';
