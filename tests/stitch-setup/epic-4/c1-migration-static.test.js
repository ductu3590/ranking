'use strict';
// Epic 4 · C1 — khóa migration 112 (spec lat-c1-danh-tinh.md §2, §7). Đọc mã nguồn, không gọi DB.

const { assert, read, exists, suite } = require('../_harness');

const MIGRATION = 'database/migrations/112_player_accounts.sql';
const INTEGRATION = 'database/tests/epic4_c1_integration.sql';
const sql = exists(MIGRATION) ? read(MIGRATION).replace(/\r\n?/g, '\n') : '';
// Bỏ comment `--` để chỉ kiểm mã chạy thật.
const code = sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

suite('C1 migration 112', {
  'file tồn tại, một transaction': () => {
    assert.ok(sql.length > 0, `thiếu ${MIGRATION}`);
    assert.ok(/^BEGIN;/m.test(code) && /^COMMIT;/m.test(code));
  },
  'ba bảng mới, idempotent': () => {
    for (const table of ['player_accounts', 'player_sessions', 'public_rate_limits']) {
      assert.ok(code.includes(`CREATE TABLE IF NOT EXISTS public.${table}`), table);
      assert.ok(code.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`), `${table} phải bật RLS`);
      assert.ok(new RegExp(`COMMENT ON TABLE public\\.${table}`).test(code), `${table} thiếu COMMENT`);
    }
    assert.ok(!/CREATE POLICY/i.test(code), 'không tạo policy: mọi truy cập qua service role');
  },
  'player_accounts: SĐT duy nhất, ràng buộc giá trị': () => {
    assert.ok(/phone_norm\s+text\s+NOT NULL\s+UNIQUE/.test(code));
    assert.ok(/status\s+text\s+NOT NULL\s+DEFAULT 'active'\s+CHECK \(status IN \('active', 'disabled'\)\)/.test(code));
    assert.ok(/gender IN \('male', 'female'\)/.test(code));
    assert.ok(/char_length\(display_name\) <= 60/.test(code));
    assert.ok(/self_declared_phr >= 0/.test(code));
    assert.ok(/athlete_id\s+bigint\s+REFERENCES public\.athletes\(id\)/.test(code));
    assert.ok(/access_version\s+bigint\s+NOT NULL\s+DEFAULT 1/.test(code));
  },
  'player_sessions: khóa ngoại + duy nhất (account, băm khóa) + index': () => {
    assert.ok(/account_id\s+bigint\s+NOT NULL\s+REFERENCES public\.player_accounts\(id\)/.test(code));
    assert.ok(/UNIQUE \(account_id, session_key_hash\)/.test(code));
    assert.ok(/CREATE INDEX IF NOT EXISTS idx_player_sessions_account/.test(code));
  },
  'consume_rate_limit: nguyên tử, SECURITY DEFINER, chỉ service_role': () => {
    assert.ok(code.includes('CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)'));
    assert.ok(/SECURITY DEFINER SET search_path = public/.test(code));
    assert.ok(/ON CONFLICT \(bucket\) DO UPDATE/.test(code));
    assert.ok(/REVOKE ALL ON FUNCTION public\.consume_rate_limit\(text, integer, integer\) FROM PUBLIC, anon, authenticated/.test(code));
    assert.ok(/GRANT EXECUTE ON FUNCTION public\.consume_rate_limit\(text, integer, integer\) TO service_role/.test(code));
    assert.ok(/p_limit NOT BETWEEN 1 AND 1000/.test(code));
    assert.ok(/p_window_seconds NOT BETWEEN 1 AND 86400/.test(code));
  },
  'additive: không DROP/TRUNCATE/DELETE, không sửa bảng có sẵn': () => {
    assert.ok(!/\bDROP\b/i.test(code), 'không DROP');
    assert.ok(!/\bTRUNCATE\b/i.test(code), 'không TRUNCATE');
    assert.ok(!/\bDELETE\s+FROM\b/i.test(code), 'không DELETE FROM');
    const alters = [...code.matchAll(/ALTER TABLE public\.(\w+)/g)].map((m) => m[1]);
    for (const table of alters) assert.ok(['player_accounts', 'player_sessions', 'public_rate_limits'].includes(table), `không được sửa bảng có sẵn: ${table}`);
  },
  'có SQL tích hợp ROLLBACK': () => {
    assert.ok(exists(INTEGRATION), `thiếu ${INTEGRATION}`);
    const test = read(INTEGRATION);
    assert.ok(/ROLLBACK;/.test(test));
    assert.ok(/zz\.ALL/.test(test));
  },
});
