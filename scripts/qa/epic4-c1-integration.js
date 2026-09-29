'use strict';
// Sinh SQL kiểm thử tích hợp Epic 4 C1 (MỘT transaction, ROLLBACK ở cuối). Nạp luôn thân migration 112 trong
// transaction nên kiểm được TRƯỚC khi apply thật (DDL Postgres có transaction: ROLLBACK trả lại mọi thứ).
// Mọi ca sai → RAISE EXCEPTION 'IT_FAIL <ca>: …' (transaction hỏng, không gì được ghi). Không ghi dữ liệu thật.
//
// Dùng:
//   node scripts/qa/epic4-c1-integration.js            > database/tests/epic4_c1_integration.sql
//   node scripts/qa/epic4-c1-integration.js --applied  (112 đã apply: bỏ thân migration, dùng hàm đang chạy)
//   node scripts/qa/epic4-c1-integration.js --md5      (md5(prosrc) kỳ vọng của consume_rate_limit + câu SQL so)
// Không kiểm được trong MỘT transaction: hai lời gọi song song cùng bucket. Bảo đảm nằm ở thiết kế: đếm bằng đúng
// một câu INSERT … ON CONFLICT DO UPDATE (kiểm bằng đọc mã trong tests/stitch-setup/epic-4/c1-migration-static.test.js).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/112_player_accounts.sql'), 'utf8')
  .replace(/\r\n?/g, '\n');

if (process.argv.includes('--md5')) {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.consume_rate_limit(');
  const open = migration.indexOf('AS $$', start) + 'AS $$'.length;
  const close = migration.indexOf('$$;', open);
  const md5 = crypto.createHash('md5').update(migration.slice(open, close), 'utf8').digest('hex');
  process.stdout.write(`consume_rate_limit\t${md5}\n-- So trên DB sau khi apply:\n`
    + "SELECT proname, md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'consume_rate_limit';\n");
  process.exit(0);
}

const body = process.argv.includes('--applied')
  ? ''
  : migration.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');

const tests = `
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
`;

process.stdout.write(`-- Kiểm thử tích hợp Epic 4 C1: migration 112 (nạp trong transaction) + bộ đếm tần suất + ràng buộc tài khoản/phiên.
-- Sinh bởi scripts/qa/epic4-c1-integration.js. MỘT transaction, ROLLBACK ở cuối.
-- Kỳ vọng: bảng it_result liệt kê mọi ca (k, v), dòng cuối 'zz.ALL' = 'ok'. Ca sai → lỗi 'IT_FAIL <ca>: …' và không có bảng.
BEGIN;
${body}${tests}ROLLBACK;
`);
