'use strict';
// Epic 4 · C2 — khóa migration 113 (spec lat-c2-dang-ky-ghep-cap.md §2, §7). Đọc mã nguồn, không gọi DB.

const { assert, read, exists, suite } = require('../_harness');

const MIGRATION = 'database/migrations/113_community_registrations.sql';
const INTEGRATION = 'database/tests/epic4_c2_integration.sql';
const sql = exists(MIGRATION) ? read(MIGRATION).replace(/\r\n?/g, '\n') : '';
const code = sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

const PUBLIC_RPCS = {
  community_register: 'bigint, bigint, text',
  community_player_action: 'bigint, bigint, text, jsonb',
  community_join_by_link: 'text, bigint',
  community_invite_action: 'bigint, bigint, text',
  community_admin_action: 'bigint, bigint, text, text, bigint, bigint',
};
const INTERNAL = {
  community_lock_division: 'bigint, boolean',
  community_account_seat: 'bigint, jsonb',
  community_active_registration: 'bigint, bigint',
  community_insert_registration: 'jsonb, jsonb, text',
  community_cancel_pending_invites: 'bigint, bigint[], bigint[]',
  community_merge_registrations: 'bigint, bigint',
  community_send_invite: 'jsonb, bigint, text, text',
  community_join_pair: 'jsonb, bigint, bigint',
};

suite('C2 migration 113', {
  'file tồn tại, một transaction': () => {
    assert.ok(sql.length > 0, `thiếu ${MIGRATION}`);
    assert.ok(/^BEGIN;/m.test(code) && /^COMMIT;/m.test(code));
  },
  'cột mới đúng danh sách, idempotent': () => {
    for (const column of ['player_account_id bigint REFERENCES public.player_accounts(id)', 'fee_confirmed_at timestamptz',
      'fee_confirmed_by_platform_account_id bigint REFERENCES public.platform_accounts(id)', 'partner_link_hash text',
      'partner_link_expires_at timestamptz', 'invited_player_account_id bigint REFERENCES public.player_accounts(id)']) {
      assert.ok(code.includes(`ADD COLUMN IF NOT EXISTS ${column}`), column);
    }
    assert.ok(/partner_link_hash ~ '\^\[a-f0-9\]\{64\}\$'/.test(code), 'băm phải đúng định dạng sha256 hex');
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS tournament_registrations_partner_link_uidx/.test(code), 'băm link duy nhất');
    assert.ok(/tournament_pair_invites_target_ck/.test(code) && /invited_player_account_id IS NOT NULL/.test(code));
  },
  'không đổi CHECK của origin/status: đơn cộng đồng dùng origin public_self': () => {
    assert.ok(!/origin_chk|status_check|public_club_chk/.test(code), 'không đụng ràng buộc origin/status có sẵn');
    assert.ok(/'public_self'/.test(code), 'RPC chèn origin public_self');
  },
  'additive: không DROP/TRUNCATE/DELETE (ngoại lệ duy nhất: DROP NOT NULL của to_registration_id)': () => {
    const stripped = code.replace(/ALTER COLUMN to_registration_id DROP NOT NULL/g, '');
    assert.ok(!/\bDROP\b/i.test(stripped), 'không DROP');
    assert.ok(!/\bTRUNCATE\b/i.test(stripped), 'không TRUNCATE');
    assert.ok(!/\bDELETE\s+FROM\b/i.test(stripped), 'không DELETE FROM');
    const alters = [...code.matchAll(/ALTER TABLE public\.(\w+)/g)].map((m) => m[1]);
    for (const table of alters) assert.ok(['tournament_registrations', 'tournament_registration_members', 'tournament_pair_invites'].includes(table), `không được sửa bảng: ${table}`);
  },
  'năm RPC công khai: SECURITY DEFINER, search_path cố định, chỉ service_role': () => {
    for (const [name, args] of Object.entries(PUBLIC_RPCS)) {
      const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      assert.ok(start >= 0, `thiếu hàm ${name}`);
      const header = code.slice(start, code.indexOf('AS $$', start));
      assert.ok(/SECURITY DEFINER SET search_path = public/.test(header), `${name}: SECURITY DEFINER + search_path`);
      assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.${name}(${args}) FROM PUBLIC, anon, authenticated;`), `${name}: REVOKE`);
      assert.ok(code.includes(`GRANT EXECUTE ON FUNCTION public.${name}(${args}) TO service_role;`), `${name}: GRANT service_role`);
    }
  },
  'hàm nội bộ: không quyền thực thi cho ai (kể cả service_role), search_path cố định': () => {
    for (const [name, args] of Object.entries(INTERNAL)) {
      const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      assert.ok(start >= 0, `thiếu hàm nội bộ ${name}`);
      const header = code.slice(start, code.indexOf('AS $$', start));
      assert.ok(/SET search_path = public/.test(header), `${name}: search_path`);
      assert.ok(!/SECURITY DEFINER/.test(header), `${name}: hàm nội bộ không SECURITY DEFINER`);
      assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.${name}(${args}) FROM PUBLIC, anon, authenticated, service_role;`), `${name}: REVOKE mọi vai trò`);
      assert.ok(!code.includes(`GRANT EXECUTE ON FUNCTION public.${name}(`), `${name}: không GRANT`);
    }
  },
  'khoá theo division trước mọi thao tác ghi, xung đột = PH409': () => {
    assert.ok(/pg_advisory_xact_lock\(hashtextextended\('community_division:'/.test(code));
    for (const name of Object.keys(PUBLIC_RPCS)) {
      const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      const body = code.slice(start, code.indexOf('\n$$;', start) + 4);
      assert.ok(/community_lock_division\(/.test(body), `${name} phải khoá division`);
    }
    assert.ok(/USING ERRCODE = 'PH409'/.test(code));
    assert.ok(!/USING ERRCODE = '40001'/.test(code), 'không dùng 40001');
  },
  'mã lỗi RPC khớp danh sách domain': () => {
    const { COMMUNITY_ERRORS } = require('../../../lib/tournament/communityRegistration.js');
    const raised = new Set([...code.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)].map((m) => m[1]));
    for (const codeName of raised) {
      assert.ok(COMMUNITY_ERRORS.includes(codeName) || codeName === 'PLAYER_SESSION_REQUIRED', `RPC ném mã lạ: ${codeName}`);
    }
    for (const must of ['COMMUNITY_ALREADY_REGISTERED', 'COMMUNITY_CAPACITY_FULL', 'COMMUNITY_LINK_INVALID', 'COMMUNITY_MIXED_GENDER_REQUIRED',
      'COMMUNITY_TOURNAMENT_LOCKED', 'COMMUNITY_CONFLICT', 'COMMUNITY_FEE_NOT_APPLICABLE', 'COMMUNITY_NOT_OPEN', 'COMMUNITY_DEADLINE_PASSED']) {
      assert.ok(raised.has(must), `RPC phải ném ${must}`);
    }
  },
  'lời mời theo SĐT im lặng khi tài khoản không tồn tại (chống dò SĐT)': () => {
    const start = code.indexOf('CREATE OR REPLACE FUNCTION public.community_send_invite(');
    const body = code.slice(start, code.indexOf('\n$$;', start));
    assert.ok(/IF v_partner IS NULL THEN RETURN; END IF;/.test(body));
  },
  'có SQL tích hợp ROLLBACK': () => {
    assert.ok(exists(INTEGRATION), `thiếu ${INTEGRATION}`);
    const test = read(INTEGRATION);
    assert.ok(/ROLLBACK;/.test(test) && /zz\.ALL/.test(test));
  },
});
