-- Bật RLS backstop cho 7 bảng giải đấu v2 (sửa: migration 015 lỡ DISABLE).
-- Mô hình bảo mật: server route dùng service-role (supabaseAdmin) bypass RLS;
-- anon key (browser) bị RLS chặn. ĐÃ ÁP prod 2026-06-16.

ALTER TABLE tournaments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_stages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_entrants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_entrant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_stage_entrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_games          ENABLE ROW LEVEL SECURITY;

-- Realtime trang công khai cần anon đọc matches + games (CHỈ SELECT, không ghi).
-- Writes vẫn chỉ qua server (service-role bypass). Các bảng khác: anon bị chặn hoàn toàn.
DROP POLICY IF EXISTS tournament_matches_public_read ON tournament_matches;
CREATE POLICY tournament_matches_public_read ON tournament_matches FOR SELECT USING (true);
DROP POLICY IF EXISTS tournament_games_public_read ON tournament_games;
CREATE POLICY tournament_games_public_read ON tournament_games FOR SELECT USING (true);
