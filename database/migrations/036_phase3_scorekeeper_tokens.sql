-- Phase 3 Task 6: one-time scorekeeper credentials.
-- Store only a hash; the raw token is returned once to the organizer for QR/link sharing.
CREATE TABLE IF NOT EXISTS tournament_scorekeeper_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id bigint NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  tournament_id bigint NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage_id bigint REFERENCES tournament_stages(id) ON DELETE CASCADE,
  match_id bigint REFERENCES tournament_matches(id) ON DELETE CASCADE,
  court text,
  token_hash text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  -- Token là giấy thông hành dùng nhiều lần cho tới khi hết hạn hoặc bị thu hồi.
  -- Người cầm điểm phải lưu được nhiều lần trong một trận: sau mỗi ván, khi sửa
  -- tỉ số gõ nhầm, và khi thử lại lúc mạng chập chờn. Chống ghi trùng nằm ở
  -- p_idempotency_key của replace_tournament_games (migration 019), không nằm ở
  -- token. last_used_at chỉ để phục vụ audit.
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_scorekeeper_tokens_target_ck CHECK (match_id IS NOT NULL OR court IS NOT NULL),
  CONSTRAINT tournament_scorekeeper_tokens_expiry_ck CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_scorekeeper_tokens_match_active
  ON tournament_scorekeeper_tokens(match_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE tournament_scorekeeper_tokens ENABLE ROW LEVEL SECURITY;
