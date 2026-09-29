'use strict';
// Epic 4 · C3 — khoá migration 114 (nhánh cộng đồng của finalize_internal_setup_v4) so với 111 (spec lat-c3 §4 "Test khóa").
// 114 phải chỉ khác 111 ở các khối -- community:begin/end, dòng -- community:decl và lệnh mở CHECK source; phần còn lại
// (hàm, REVOKE/GRANT, COMMENT) byte-giống sau chuẩn hóa. Như vậy bản 111 (giao hữu) và 108 (loại kép, vòng tròn…) không bị hồi quy.

const { assert, read, exists, lib, suite } = require('../_harness');

const { COMMUNITY_FINALIZE_SQL_CONTRACT: CONTRACT } = lib('lib/tournament/communitySetup.js');

const norm = (text) => text.replace(/\r\n?/g, '\n');
const sql114 = exists('database/migrations/114_finalize_v4_community.sql') ? norm(read('database/migrations/114_finalize_v4_community.sql')) : '';
const sql111 = norm(read('database/migrations/111_finalize_v4_friendly.sql'));

function functionAndAfter(sql) {
  const index = sql.indexOf('CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4(');
  assert.ok(index >= 0, 'không thấy hàm finalize_internal_setup_v4');
  return sql.slice(index);
}

// Bỏ các khối community; chuẩn hóa khoảng trắng đầu/cuối dòng và dòng trống để so byte-giống phần còn lại.
function stripCommunity(sql) {
  const lines = sql.split('\n');
  const out = [];
  let inside = false;
  for (const line of lines) {
    if (line.includes(CONTRACT.markers.begin)) { assert.ok(!inside, 'khối community lồng nhau'); inside = true; continue; }
    if (line.includes(CONTRACT.markers.end)) { assert.ok(inside, 'community:end không có begin'); inside = false; continue; }
    if (inside || line.includes(CONTRACT.markers.decl)) continue;
    out.push(line.replace(/\s+$/, ''));
  }
  assert.ok(!inside, 'community:begin không được đóng');
  return out.join('\n').replace(/\n{2,}/g, '\n').trim();
}

const communityBlocks = (() => {
  const blocks = [];
  let current = null;
  for (const line of sql114.split('\n')) {
    if (line.includes(CONTRACT.markers.begin)) current = [];
    if (current) current.push(line);
    if (line.includes(CONTRACT.markers.end) && current) { blocks.push(current.join('\n')); current = null; }
  }
  return blocks;
})();

suite('C3 khoá migration 114', {
  'file 114 tồn tại và có BEGIN/COMMIT': () => {
    assert.ok(sql114, 'thiếu 114_finalize_v4_community.sql');
    assert.ok(/^BEGIN;$/m.test(sql114) && /^COMMIT;$/m.test(sql114));
  },
  '114 chỉ khác 111 ở khối community (phần hàm + REVOKE/GRANT/COMMENT byte-giống)': () => {
    const a = stripCommunity(functionAndAfter(sql114));
    const b = stripCommunity(functionAndAfter(sql111));
    assert.equal(a, b, '114 sau khi bỏ khối community phải bằng 111');
  },
  'các marker cân bằng, đủ 5 khối begin/end + 3 dòng decl': () => {
    const begins = sql114.split(CONTRACT.markers.begin).length - 1;
    const ends = sql114.split(CONTRACT.markers.end).length - 1;
    assert.equal(begins, ends);
    assert.equal(begins, 5, `số khối community: ${begins}`);
    assert.equal(sql114.split(CONTRACT.markers.decl).length - 1, 3);
  },
  'mọi mã RAISE của hợp đồng có trong khối community': () => {
    const text = communityBlocks.join('\n');
    for (const code of CONTRACT.raiseCodes) assert.ok(text.includes(`'${code}'`), `thiếu ${code}`);
  },
  'khóa cặp SQL đúng hợp đồng và refs player:<id>': () => {
    const text = communityBlocks.join('\n');
    assert.ok(text.includes(CONTRACT.pairKeySql), 'khóa cặp SQL lệch hợp đồng TS');
    assert.ok(text.includes("'player:' || m1.player_account_id") && text.includes("'player:' || m2.player_account_id"));
    assert.ok(text.includes(`'${CONTRACT.source}'`));
  },
  'nhận diện cộng đồng bằng tournaments.organizer_type, không bằng bản nháp': () => {
    const first = communityBlocks[0];
    assert.ok(first.includes("v_community := (t.organizer_type = 'community')"));
    assert.ok(!/v_community\s*:=[^;]*v_draft/.test(first), 'không lấy v_community từ bản nháp');
  },
  'chỉ chọn đơn approved, chưa gộp, hai ghế khác tài khoản, tài khoản active': () => {
    const text = communityBlocks[0];
    for (const needle of ["r.status = 'approved'", 'r.merged_into IS NULL', 'm1.player_account_id <> m2.player_account_id', "pa.status = 'active'", 'FOR UPDATE']) {
      assert.ok(text.includes(needle), `thiếu điều kiện: ${needle}`);
    }
    assert.ok(text.includes("hashtextextended('community_division:' || p_division_id::text, 0)"), 'phải cùng advisory lock với community_lock_division');
  },
  'tạo athletes không gắn legacy_club_member_id và gán lại player_accounts.athlete_id': () => {
    const text = communityBlocks.join('\n');
    const insert = text.match(/INSERT INTO public\.athletes\(([^)]*)\)/);
    assert.ok(insert, 'thiếu INSERT athletes');
    assert.ok(!/legacy_club_member_id/.test(insert[1]), 'athletes của cộng đồng không có legacy_club_member_id');
    assert.ok(/UPDATE public\.player_accounts SET athlete_id = v_athlete_id/.test(text));
    assert.ok(/IF v_athlete_id IS NULL THEN/.test(text), 'chỉ tạo athletes khi tài khoản chưa có');
  },
  'chỉ nới CHECK source, không xoá dữ liệu': () => {
    assert.ok(/DROP CONSTRAINT IF EXISTS tournament_athletes_source_ck/.test(sql114));
    assert.ok(/CHECK \(source = ANY \(ARRAY\['club_member'::text, 'guest'::text, 'community'::text\]\)\)/.test(sql114));
    const executable = sql114.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    assert.ok(!/\bDROP\s+(TABLE|FUNCTION|COLUMN|SCHEMA)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(executable), 'không được phá dữ liệu');
    assert.equal((executable.match(/\bDROP\b/g) || []).length, 1, 'chỉ một DROP CONSTRAINT IF EXISTS');
  },
  'signature, SECURITY DEFINER, search_path, GRANT service_role giữ nguyên': () => {
    assert.ok(/SECURITY DEFINER SET search_path = public/.test(sql114));
    assert.ok(/GRANT EXECUTE ON FUNCTION public\.finalize_internal_setup_v4\(bigint,bigint,bigint,bigint,text,text,jsonb\) TO service_role;/.test(sql114));
    assert.ok(/REVOKE ALL ON FUNCTION public\.finalize_internal_setup_v4\(bigint,bigint,bigint,bigint,text,text,jsonb\) FROM PUBLIC, anon, authenticated;/.test(sql114));
  },
  'không chạm hàm lưu nháp: bản nháp cộng đồng giữ organizerMode internal': () => {
    assert.ok(!/save_unified_setup_aggregate_draft/.test(sql114.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')));
  },
});
