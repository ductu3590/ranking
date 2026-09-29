'use strict';
// Epic 4 · C2 — ma trận quyền: VĐV / admin hệ thống / CLB / ẩn danh (spec lat-c2 §7). Đọc mã nguồn.

const fs = require('node:fs');
const path = require('node:path');
const { assert, read, exists, ROOT, suite } = require('../_harness');

function walk(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name).replace(/\\/g, '/');
    return entry.isDirectory() ? walk(rel) : (/\.(js|jsx)$/.test(entry.name) ? [rel] : []);
  });
}
const importsFrom = (code, name) => new RegExp(`from ['"][^'"]*${name}['"]|require\\(['"][^'"]*${name}['"]\\)`).test(code);
const PLAYER_ROOT = 'app/api/tournament-v2/community/';
const ADMIN_ROOT = 'app/api/tournament-v2/community/admin/';

suite('C2 ma trận quyền', {
  'route admin không import phiên VĐV/CLB/athlete; route VĐV không import phiên admin/CLB': () => {
    for (const file of walk('app/api/tournament-v2/community')) {
      const code = read(file);
      const isAdmin = file.startsWith(ADMIN_ROOT);
      if (isAdmin) {
        for (const forbidden of ['playerSession', 'athleteSession', 'groupSession']) {
          assert.ok(!importsFrom(code, forbidden), `${file} (admin) không được import ${forbidden}`);
        }
        assert.ok(/requireCommunityAdmin|requireTournamentAccess/.test(code), `${file} phải kiểm quyền admin`);
      } else {
        for (const forbidden of ['platformSession', 'communityAdminServer', 'athleteSession', 'groupSession', 'accessRuntime']) {
          assert.ok(!importsFrom(code, forbidden), `${file} (VĐV) không được import ${forbidden}`);
        }
        assert.ok(/requirePlayerSession/.test(code), `${file} phải yêu cầu phiên VĐV`);
      }
    }
  },
  'lớp server VĐV không đụng phiên admin; lớp admin không đụng phiên VĐV': () => {
    assert.ok(!/platformSession|communityAdminServer/.test(read('lib/communityServer.js')), 'communityServer dùng chung, không nhập phiên admin');
    assert.ok(!/playerSession/.test(read('lib/communityServer.js')), 'communityServer không nhập phiên VĐV');
    assert.ok(!/playerSession/.test(read('lib/communityAdminServer.js')));
  },
  'không route nào ngoài khu community + player import playerSession/communityAdminServer': () => {
    const allowedPlayer = (file) => file.startsWith('app/api/player/') || file.startsWith(PLAYER_ROOT) || file.startsWith('app/cong-dong/') || file === 'lib/playerSession.js';
    for (const file of [...walk('app/api'), ...walk('lib')]) {
      const code = read(file);
      if (!allowedPlayer(file)) assert.ok(!importsFrom(code, 'playerSession'), `${file} không được import playerSession`);
      const allowedAdmin = file.startsWith(ADMIN_ROOT) || file === 'lib/communityAdminServer.js' || file.startsWith('app/cong-dong/');
      if (!allowedAdmin) assert.ok(!importsFrom(code, 'communityAdminServer'), `${file} không được import communityAdminServer`);
    }
  },
  'route công khai không nhập phiên nào và không chọn cột nhạy cảm': () => {
    for (const file of ['app/api/tournament-v2/public/community/[slug]/pairs/route.js', 'app/api/tournament-v2/public/community/route.js']) {
      assert.ok(exists(file), file);
      const code = read(file);
      for (const forbidden of ['playerSession', 'platformSession', 'groupSession']) assert.ok(!importsFrom(code, forbidden), `${file}: ${forbidden}`);
      assert.ok(!/phone_norm|contact_phone|dob|player_account_id|track_token/.test(code.replace(/\/\/.*$/gm, '')), `${file}: cột nhạy cảm`);
    }
  },
  'RPC ghi chỉ mở cho service role (đọc từ migration 113)': () => {
    const sql = read('database/migrations/113_community_registrations.sql');
    for (const name of ['community_register', 'community_player_action', 'community_join_by_link', 'community_invite_action', 'community_admin_action']) {
      assert.ok(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO service_role;`).test(sql), name);
      assert.ok(!new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO (anon|authenticated|PUBLIC)`).test(sql), `${name} không mở cho anon/authenticated`);
    }
  },
});
