'use strict';
// Epic 4 · C1 — ma trận quyền: vé VĐV không chạm được route admin, vé admin/CLB không chạm được route VĐV
// (spec lat-c1-danh-tinh.md §3 "Không để vé VĐV mở được bất kỳ route admin nào", §7). Đọc mã nguồn.

const fs = require('node:fs');
const path = require('node:path');
const { assert, read, exists, ROOT, suite } = require('../_harness');

function walk(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) return walk(rel);
    return /\.(js|jsx)$/.test(entry.name) ? [rel] : [];
  });
}

const importsFrom = (code, name) => new RegExp(`from ['"][^'"]*${name}['"]|require\\(['"][^'"]*${name}['"]\\)`).test(code);
const isPlayerPage = (file) => file.startsWith('app/cong-dong/') && !file.startsWith('app/cong-dong/quan-tri/');

suite('C1 ma trận quyền', {
  'không route nào ngoài /api/player, C2 công khai và lib/playerSession.js import playerSession': () => {
    // Được phép: chính /api/player/*, các route cộng đồng của VĐV (C2: tournament-v2/community/*), trang /cong-dong/*.
    const allowed = (file) => file.startsWith('app/api/player/') || file.startsWith('app/api/tournament-v2/community/')
      || file.startsWith('app/cong-dong/') || file === 'lib/playerSession.js';
    for (const file of [...walk('app/api'), ...walk('lib')]) {
      if (allowed(file)) continue;
      assert.ok(!importsFrom(read(file), 'playerSession'), `${file} không được import playerSession`);
    }
  },
  'route admin của giải không đọc cookie VĐV': () => {
    for (const file of ['app/api/tournament-v2/setup/route.js', 'app/api/tournament-v2/setup/finalize/route.js',
      'app/api/tournament-v2/registrations/route.js', 'app/api/tournament-v2/tournaments/route.js',
      'app/api/platform/session/route.js', 'lib/tournament/accessRuntime.js']) {
      if (!exists(file)) continue;
      const code = read(file);
      assert.ok(!/player_session|playerSession|PLAYER_SESSION_COOKIE/.test(code), `${file} không được đụng phiên VĐV`);
    }
  },
  'route VĐV không đọc phiên CLB/athlete/platform': () => {
    for (const file of walk('app/api/player')) {
      const code = read(file);
      for (const forbidden of ['athleteSession', 'groupSession', 'platformSession', 'identityRuntime']) {
        assert.ok(!importsFrom(code, forbidden), `${file} không được import ${forbidden}`);
      }
      assert.ok(!/group_session|athlete_session|platform_session/.test(code), `${file} không đọc cookie hệ khác`);
    }
  },
  'trang VĐV không gọi Supabase trực tiếp': () => {
    for (const file of walk('app/cong-dong')) {
      const code = read(file);
      assert.ok(!/supabase/i.test(code), `${file} không được dùng Supabase trực tiếp`);
    }
  },
  'trang admin hệ thống không có đường đăng ký / tài khoản VĐV': () => {
    for (const file of walk('app/cong-dong/quan-tri')) {
      if (!file.endsWith('.js')) continue;
      const code = read(file);
      assert.ok(!/\/api\/player\//.test(code), `${file} không gọi API VĐV`);
      assert.ok(!/Tạo tài khoản|Đăng ký tài khoản/.test(code), `${file} không có nút đăng ký`);
    }
  },
  'ít nhất một trang VĐV tồn tại để ma trận có nghĩa': () => {
    assert.ok(walk('app/cong-dong').some(isPlayerPage), 'thiếu trang /cong-dong/tai-khoan');
  },
});
