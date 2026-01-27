-- Migration: Tournament Management System Tables
-- Created: 2026-01-27
-- Description: Creates tables for tournament teams, players, pairings, matches, and settings

-- ============================================================
-- 1. CREATE TOURNAMENT_TEAMS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_teams (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL DEFAULT 1,
  team_name TEXT NOT NULL,
  team_code TEXT NOT NULL UNIQUE,
  captain_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for now (can enable later with proper policies)
ALTER TABLE tournament_teams DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tournament_teams IS 'Danh sách đội thi đấu trong giải';
COMMENT ON COLUMN tournament_teams.team_code IS 'Mã đội: blue, red';
COMMENT ON COLUMN tournament_teams.captain_user_id IS 'ID của đội trưởng trong auth.users';

-- ============================================================
-- 2. CREATE TOURNAMENT_PLAYERS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_players (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL DEFAULT 1,
  team_id INTEGER REFERENCES tournament_teams(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  display_order INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tournament_players DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tournament_players IS 'Danh sách thành viên trong mỗi đội';
COMMENT ON COLUMN tournament_players.display_order IS 'Thứ tự hiển thị trong danh sách';

-- ============================================================
-- 3. CREATE TOURNAMENT_PAIRINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_pairings (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL DEFAULT 1,
  team_id INTEGER REFERENCES tournament_teams(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number IN (1, 2, 3)),
  pair_order INTEGER NOT NULL CHECK (pair_order BETWEEN 1 AND 4),
  player1_id INTEGER REFERENCES tournament_players(id),
  player2_id INTEGER REFERENCES tournament_players(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'locked')),
  is_hidden BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_round_pair UNIQUE(tournament_id, team_id, round_number, pair_order),
  CONSTRAINT different_players CHECK (player1_id != player2_id)
);

ALTER TABLE tournament_pairings DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tournament_pairings IS 'Cặp đôi đã được sắp xếp cho từng vòng';
COMMENT ON COLUMN tournament_pairings.round_number IS 'Số vòng: 1, 2, 3';
COMMENT ON COLUMN tournament_pairings.pair_order IS 'Thứ tự cặp: 1, 2, 3, 4';
COMMENT ON COLUMN tournament_pairings.status IS 'Trạng thái: draft (đang sửa), submitted (đã nộp), locked (khóa)';
COMMENT ON COLUMN tournament_pairings.is_hidden IS 'Ẩn cho đến khi mở bí mật (Vòng 1)';

-- ============================================================
-- 4. CREATE TOURNAMENT_MATCHES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_matches (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL DEFAULT 1,
  round_number INTEGER NOT NULL CHECK (round_number IN (1, 2, 3)),
  match_number INTEGER NOT NULL,
  court_number INTEGER CHECK (court_number IN (1, 2)),
  scheduled_time TEXT,
  
  -- Team XANH (Blue)
  blue_pair_id INTEGER REFERENCES tournament_pairings(id),
  blue_score INTEGER DEFAULT 0,
  
  -- Team ĐỎ (Red)
  red_pair_id INTEGER REFERENCES tournament_pairings(id),
  red_score INTEGER DEFAULT 0,
  
  -- Match metadata
  match_status TEXT DEFAULT 'pending' CHECK (match_status IN ('pending', 'live', 'completed')),
  winner_team TEXT CHECK (winner_team IN ('blue', 'red')),
  match_type TEXT DEFAULT 'doubles' CHECK (match_type IN ('doubles', 'team')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_match UNIQUE(tournament_id, round_number, match_number)
);

ALTER TABLE tournament_matches DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tournament_matches IS 'Lịch thi đấu và kết quả các trận';
COMMENT ON COLUMN tournament_matches.match_status IS 'pending (chưa đấu), live (đang đấu), completed (hoàn thành)';
COMMENT ON COLUMN tournament_matches.match_type IS 'doubles (đánh đôi), team (đồng đội)';

-- ============================================================
-- 5. CREATE TOURNAMENT_SETTINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_settings (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL DEFAULT 1,
  setting_key TEXT NOT NULL,
  setting_value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_setting UNIQUE(tournament_id, setting_key)
);

ALTER TABLE tournament_settings DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tournament_settings IS 'Cài đặt giải đấu (thời gian mở bí mật, phase hiện tại...)';

-- ============================================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tournament_players_team ON tournament_players(team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pairings_team_round ON tournament_pairings(team_id, round_number);
CREATE INDEX IF NOT EXISTS idx_tournament_pairings_status ON tournament_pairings(status);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round_number);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(match_status);
CREATE INDEX IF NOT EXISTS idx_tournament_settings_key ON tournament_settings(setting_key);

-- ============================================================
-- 7. INSERT SEED DATA - TEAMS
-- ============================================================

INSERT INTO tournament_teams (tournament_id, team_name, team_code) VALUES
(1, 'TEAM XANH', 'blue'),
(1, 'TEAM ĐỎ', 'red')
ON CONFLICT (team_code) DO NOTHING;

-- ============================================================
-- 8. INSERT SEED DATA - PLAYERS
-- ============================================================

-- Team XANH (Blue Team)
INSERT INTO tournament_players (tournament_id, team_id, player_name, display_order) VALUES
(1, (SELECT id FROM tournament_teams WHERE team_code = 'blue'), 'VŨ NGỌC HƯNG', 1),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'blue'), 'ĐẶNG NGỌC DƯƠNG', 2),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'blue'), 'ĐỖ ĐỨC TÚ', 3),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'blue'), 'NGUYỄN MẠNH THẮNG', 4),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'blue'), 'TRẦN TẤT HẢO', 5),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'blue'), 'ĐINH TRỌNG GIÁP', 6),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'blue'), 'KM - HẢI BVT', 7),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'blue'), 'KM - SƠN BÉO', 8)
ON CONFLICT DO NOTHING;

-- Team ĐỎ (Red Team)
INSERT INTO tournament_players (tournament_id, team_id, player_name, display_order) VALUES
(1, (SELECT id FROM tournament_teams WHERE team_code = 'red'), 'VŨ DUY TÙNG', 1),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'red'), 'ĐẶNG TIẾN ANH', 2),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'red'), 'HOÀNG NGỌC THẠCH', 3),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'red'), 'LẠI HỮU PHƯƠNG', 4),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'red'), 'NGUYỄN NHẬT QUANG', 5),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'red'), 'NGUYỄN VĂN THÀNH', 6),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'red'), 'KM - THẦY QUANG', 7),
(1, (SELECT id FROM tournament_teams WHERE team_code = 'red'), 'KM - MR BÌNH', 8)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. INSERT DEFAULT SETTINGS
-- ============================================================

INSERT INTO tournament_settings (tournament_id, setting_key, setting_value) VALUES
(1, 'round1_reveal_time', '"2026-01-27T16:30:00+07:00"'::jsonb),
(1, 'current_phase', '"pre_match"'::jsonb),
(1, 'round1_winner', 'null'::jsonb),
(1, 'round2_winner', 'null'::jsonb)
ON CONFLICT (tournament_id, setting_key) 
DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- ============================================================
-- 10. INSERT MATCH SCHEDULE TEMPLATE
-- ============================================================

-- Vòng 1 matches (4 trận)
INSERT INTO tournament_matches (tournament_id, round_number, match_number, court_number, scheduled_time, match_type) VALUES
(1, 1, 1, 1, '17:00 - 17:25', 'doubles'),
(1, 1, 2, 2, '17:00 - 17:25', 'doubles'),
(1, 1, 3, 1, '17:25 - 17:50', 'doubles'),
(1, 1, 4, 2, '17:25 - 17:50', 'doubles')
ON CONFLICT (tournament_id, round_number, match_number) DO NOTHING;

-- Vòng 2 matches (4 trận)
INSERT INTO tournament_matches (tournament_id, round_number, match_number, court_number, scheduled_time, match_type) VALUES
(1, 2, 5, 1, '17:55 - 18:20', 'doubles'),
(1, 2, 6, 2, '17:55 - 18:20', 'doubles'),
(1, 2, 7, 1, '18:20 - 18:45', 'doubles'),
(1, 2, 8, 2, '18:20 - 18:45', 'doubles')
ON CONFLICT (tournament_id, round_number, match_number) DO NOTHING;

-- Vòng 3 match (1 trận team)
INSERT INTO tournament_matches (tournament_id, round_number, match_number, court_number, scheduled_time, match_type) VALUES
(1, 3, 9, 1, '18:50 - 20:05', 'team')
ON CONFLICT (tournament_id, round_number, match_number) DO NOTHING;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================

-- Verify data
SELECT 'Teams created:' as info, COUNT(*) as count FROM tournament_teams;
SELECT 'Players created:' as info, COUNT(*) as count FROM tournament_players;
SELECT 'Matches scheduled:' as info, COUNT(*) as count FROM tournament_matches;
SELECT 'Settings configured:' as info, COUNT(*) as count FROM tournament_settings;
