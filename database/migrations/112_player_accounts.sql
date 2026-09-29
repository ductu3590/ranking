-- 112: Tài khoản VĐV công khai + phiên + bộ đếm giới hạn tần suất lưu DB
-- (spec Epic 4 C1 §2; ADR-007 D54, D60).
-- Additive, forward-only, một transaction. Không đổi/không xoá bảng có sẵn, không đụng dữ liệu CLB đang chạy.
--   1. player_accounts: tài khoản người chơi ngoài CLB (SĐT chuẩn hóa + mật khẩu). athlete_id để NULL cho tới lúc
--      chốt giải (lát C3) — tài khoản spam không sinh bản ghi athletes.
--   2. player_sessions: bản ghi phiên (băm khóa), thu hồi được.
--   3. public_rate_limits + consume_rate_limit(): bộ đếm nguyên tử dùng chung cho C1/C2. Bộ nhớ tiến trình
--      (lib/rateLimit.js) không bền trên serverless nên không đủ cho đăng ký/đăng nhập công khai.
-- RLS bật, KHÔNG policy: mọi truy cập đi qua service role trong route (như platform_accounts/athlete_accounts).
BEGIN;

CREATE TABLE IF NOT EXISTS public.player_accounts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone_norm text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL CHECK (btrim(display_name) <> '' AND char_length(display_name) <= 60),
  gender text CHECK (gender IN ('male', 'female')),
  dob date,
  self_declared_phr numeric CHECK (self_declared_phr IS NULL OR self_declared_phr >= 0),
  athlete_id bigint REFERENCES public.athletes(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  access_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_accounts_athlete ON public.player_accounts (athlete_id) WHERE athlete_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.player_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES public.player_accounts(id) ON DELETE CASCADE,
  session_key_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, session_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_player_sessions_account ON public.player_sessions (account_id, expires_at);

CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  bucket text PRIMARY KEY CHECK (char_length(bucket) BETWEEN 1 AND 300),
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_rate_limits_reset ON public.public_rate_limits (reset_at);

ALTER TABLE public.player_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.player_accounts IS 'Tài khoản VĐV công khai (Epic 4, D54): người chơi ngoài CLB đăng ký bằng SĐT + mật khẩu. Tách khỏi athlete_accounts (gắn CLB). athlete_id chỉ gán khi chốt giải cộng đồng.';
COMMENT ON TABLE public.player_sessions IS 'Bản ghi phiên đăng nhập của player_accounts (chỉ lưu băm khóa phiên). Cookie chỉ là vé; bảng này là nguồn sự thật, thu hồi được.';
COMMENT ON TABLE public.public_rate_limits IS 'Bộ đếm giới hạn tần suất cho route công khai (đăng ký/đăng nhập/…); chỉ thao tác qua consume_rate_limit().';
COMMENT ON COLUMN public.player_accounts.phone_norm IS 'SĐT chuẩn hóa dạng 0xxxxxxxxx (lib/tournament/openRegistration.normalizePhone). Duy nhất mỗi tài khoản. Không bao giờ trả ra route công khai.';
COMMENT ON COLUMN public.player_accounts.access_version IS 'Tăng khi đổi mật khẩu/khóa tài khoản → vé và phiên cũ hết giá trị.';

-- Tăng bộ đếm một bucket trong MỘT câu lệnh (nguyên tử: hai lời gọi song song không cùng đọc count cũ).
-- Trả allowed=false khi count > p_limit; retry_after = số giây còn lại tới lúc bucket đặt lại (0 khi cho phép).
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
  v_reset timestamptz;
BEGIN
  IF p_bucket IS NULL OR char_length(p_bucket) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'consume_rate_limit: bucket không hợp lệ';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'consume_rate_limit: p_limit phải trong 1..1000';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'consume_rate_limit: p_window_seconds phải trong 1..86400';
  END IF;

  INSERT INTO public.public_rate_limits AS r (bucket, count, reset_at)
  VALUES (p_bucket, 1, now() + make_interval(secs => p_window_seconds))
  ON CONFLICT (bucket) DO UPDATE SET
    count = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.count + 1 END,
    reset_at = CASE WHEN r.reset_at <= now() THEN now() + make_interval(secs => p_window_seconds) ELSE r.reset_at END
  RETURNING r.count, r.reset_at INTO v_count, v_reset;

  allowed := v_count <= p_limit;
  retry_after := CASE WHEN allowed THEN 0 ELSE GREATEST(1, ceil(extract(epoch FROM (v_reset - now())))::integer) END;
  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

COMMIT;
