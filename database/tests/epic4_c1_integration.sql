-- Kiểm thử tích hợp Epic 4 C1: migration 112 (nạp trong transaction) + bộ đếm tần suất + ràng buộc tài khoản/phiên.
-- Sinh bởi scripts/qa/epic4-c1-integration.js. MỘT transaction, ROLLBACK ở cuối.
-- Kỳ vọng: bảng it_result liệt kê mọi ca (k, v), dòng cuối 'zz.ALL' = 'ok'. Ca sai → lỗi 'IT_FAIL <ca>: …' và không có bảng.
BEGIN;
-- 112: Tài khoản VĐV công khai + phiên + bộ đếm giới hạn tần suất lưu DB
-- (spec Epic 4 C1 §2; ADR-007 D54, D60).
-- Additive, forward-only, một transaction. Không đổi/không xoá bảng có sẵn, không đụng dữ liệu CLB đang chạy.
--   1. player_accounts: tài khoản người chơi ngoài CLB (SĐT chuẩn hóa + mật khẩu). athlete_id để NULL cho tới lúc
--      chốt giải (lát C3) — tài khoản spam không sinh bản ghi athletes.
--   2. player_sessions: bản ghi phiên (băm khóa), thu hồi được.
--   3. public_rate_limits + consume_rate_limit(): bộ đếm nguyên tử dùng chung cho C1/C2. Bộ nhớ tiến trình
--      (lib/rateLimit.js) không bền trên serverless nên không đủ cho đăng ký/đăng nhập công khai.
-- RLS bật, KHÔNG policy: mọi truy cập đi qua service role trong route (như platform_accounts/athlete_accounts).

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


CREATE TEMP TABLE it_result (k text, v text);

CREATE FUNCTION pg_temp.it_ok(k text, cond boolean, detail text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'IT_FAIL %: %', k, COALESCE(detail, 'điều kiện sai'); END IF;
  INSERT INTO it_result VALUES (k, 'ok');
END
$f$;

-- Ghi lại mã lỗi để so với kỳ vọng (SQLSTATE hoặc một đoạn thông điệp).
CREATE FUNCTION pg_temp.it_err(k text, got text, want text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF got IS NULL OR position(want IN got) = 0 THEN RAISE EXCEPTION 'IT_FAIL %: mong đợi lỗi chứa "%", nhận "%"', k, want, COALESCE(got, '(không lỗi)'); END IF;
  INSERT INTO it_result VALUES (k, 'ok');
END
$f$;

DO $it$
DECLARE
  r record;
  e text;
  a_id bigint;
  i integer;
  allowed_count integer := 0;
BEGIN
  -- ===== consume_rate_limit =====
  FOR i IN 1..4 LOOP
    SELECT * INTO r FROM public.consume_rate_limit('it:c1:a', 3, 60);
    IF r.allowed THEN allowed_count := allowed_count + 1; END IF;
  END LOOP;
  PERFORM pg_temp.it_ok('rate.limit_plus_one', allowed_count = 3 AND r.allowed = false AND r.retry_after > 0 AND r.retry_after <= 60,
    format('allowed_count=%s allowed=%s retry_after=%s', allowed_count, r.allowed, r.retry_after));

  SELECT * INTO r FROM public.consume_rate_limit('it:c1:b', 3, 60);
  PERFORM pg_temp.it_ok('rate.other_bucket_independent', r.allowed = true AND r.retry_after = 0, NULL);

  -- Hết cửa sổ → bucket đặt lại từ 1.
  UPDATE public.public_rate_limits SET reset_at = now() - interval '1 second' WHERE bucket = 'it:c1:a';
  SELECT * INTO r FROM public.consume_rate_limit('it:c1:a', 3, 60);
  PERFORM pg_temp.it_ok('rate.window_reset', r.allowed = true AND (SELECT count FROM public.public_rate_limits WHERE bucket = 'it:c1:a') = 1, NULL);

  e := NULL; BEGIN PERFORM public.consume_rate_limit('it:c1:x', 0, 60); EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  PERFORM pg_temp.it_err('rate.limit_zero_rejected', e, 'p_limit');
  e := NULL; BEGIN PERFORM public.consume_rate_limit('it:c1:x', 3, 0); EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  PERFORM pg_temp.it_err('rate.window_zero_rejected', e, 'p_window_seconds');
  e := NULL; BEGIN PERFORM public.consume_rate_limit('', 3, 60); EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  PERFORM pg_temp.it_err('rate.bucket_empty_rejected', e, 'bucket');

  -- ===== player_accounts =====
  INSERT INTO public.player_accounts (phone_norm, password_hash, display_name) VALUES ('0900000001', 'pbkdf2:1:x:y', 'ZZE4 VĐV A') RETURNING id INTO a_id;
  PERFORM pg_temp.it_ok('acct.created', (SELECT status = 'active' AND access_version = 1 AND athlete_id IS NULL FROM public.player_accounts WHERE id = a_id), NULL);

  e := NULL; BEGIN INSERT INTO public.player_accounts (phone_norm, password_hash, display_name) VALUES ('0900000001', 'h', 'ZZE4 trùng'); EXCEPTION WHEN unique_violation THEN e := 'unique_violation'; END;
  PERFORM pg_temp.it_err('acct.phone_unique', e, 'unique_violation');

  e := NULL; BEGIN INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender) VALUES ('0900000002', 'h', 'ZZE4', 'x'); EXCEPTION WHEN check_violation THEN e := 'check_violation'; END;
  PERFORM pg_temp.it_err('acct.gender_check', e, 'check_violation');

  e := NULL; BEGIN INSERT INTO public.player_accounts (phone_norm, password_hash, display_name) VALUES ('0900000003', 'h', '   '); EXCEPTION WHEN check_violation THEN e := 'check_violation'; END;
  PERFORM pg_temp.it_err('acct.name_blank_check', e, 'check_violation');

  e := NULL; BEGIN INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, self_declared_phr) VALUES ('0900000004', 'h', 'ZZE4', -1); EXCEPTION WHEN check_violation THEN e := 'check_violation'; END;
  PERFORM pg_temp.it_err('acct.phr_check', e, 'check_violation');

  e := NULL; BEGIN INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, status) VALUES ('0900000005', 'h', 'ZZE4', 'khac'); EXCEPTION WHEN check_violation THEN e := 'check_violation'; END;
  PERFORM pg_temp.it_err('acct.status_check', e, 'check_violation');

  -- ===== player_sessions =====
  INSERT INTO public.player_sessions (account_id, session_key_hash, expires_at) VALUES (a_id, 'hash-1', now() + interval '1 day');
  e := NULL; BEGIN INSERT INTO public.player_sessions (account_id, session_key_hash, expires_at) VALUES (a_id, 'hash-1', now() + interval '1 day'); EXCEPTION WHEN unique_violation THEN e := 'unique_violation'; END;
  PERFORM pg_temp.it_err('session.unique', e, 'unique_violation');

  -- Xóa tài khoản kéo theo phiên (ON DELETE CASCADE) — chỉ trong transaction này.
  DELETE FROM public.player_accounts WHERE id = a_id;
  PERFORM pg_temp.it_ok('session.cascade', NOT EXISTS (SELECT 1 FROM public.player_sessions WHERE account_id = a_id), NULL);

  -- ===== phân quyền =====
  PERFORM pg_temp.it_ok('grant.rpc_service_only',
    has_function_privilege('service_role', 'public.consume_rate_limit(text, integer, integer)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.consume_rate_limit(text, integer, integer)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.consume_rate_limit(text, integer, integer)', 'EXECUTE'), NULL);
  PERFORM pg_temp.it_ok('rls.enabled', (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace
    AND relname IN ('player_accounts', 'player_sessions', 'public_rate_limits') AND relrowsecurity) = 3, NULL);

  INSERT INTO it_result VALUES ('zz.ALL', 'ok');
END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;
