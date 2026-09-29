'use strict';
// Epic 4 · C1 — hợp đồng giao diện /cong-dong/* (spec lat-c1-danh-tinh.md §5, §7). Đọc mã nguồn + kiểm safeNext thật.

const { assert, read, exists, lib, suite } = require('../_harness');

const norm = (text) => text.replace(/\r\n?/g, '\n');
const src = (file) => (exists(file) ? norm(read(file)) : '');

const { safeNext, COMMUNITY_HOME } = lib('lib/domain/identity/safeNext.js');

const layout = src('app/cong-dong/layout.js');
const css = src('app/cong-dong/community.css');
const accountPage = src('app/cong-dong/tai-khoan/page.js');
const account = src('app/cong-dong/tai-khoan/AccountClient.js');
const profilePage = src('app/cong-dong/tai-khoan/ho-so/page.js');
const profile = src('app/cong-dong/tai-khoan/ho-so/ProfileClient.js');
const adminPage = src('app/cong-dong/quan-tri/page.js');
const adminLogin = src('app/cong-dong/quan-tri/PlatformLoginClient.js');

suite('C1 safeNext', {
  'chỉ nhận đường dẫn nội bộ /cong-dong': () => {
    assert.equal(safeNext('/cong-dong/tai-khoan/ho-so'), '/cong-dong/tai-khoan/ho-so');
    assert.equal(safeNext('/cong-dong/giai/abc?tab=dang-ky'), '/cong-dong/giai/abc?tab=dang-ky');
    assert.equal(safeNext('/cong-dong'), '/cong-dong');
  },
  'từ chối mọi đường thoát hoặc ngoài phạm vi': () => {
    for (const bad of ['//evil.com', 'https://evil.com', 'http://x', '/\\evil.com', '/giai-dau', '/', '', null, undefined,
      '/cong-dong/../giai-dau', '/cong-dong//evil.com', 'javascript:alert(1)', '/cong-dongx', '/cong-dong\\evil', '/cong-dong/%2e%2e/x',
      ` /cong-dong/x`, '/cong-dong/x\n', ['/cong-dong/x']]) {
      assert.equal(safeNext(bad), COMMUNITY_HOME, `phải từ chối ${JSON.stringify(bad)}`);
    }
  },
  'fallback tùy chọn': () => {
    assert.equal(safeNext('//evil', '/cong-dong/tai-khoan'), '/cong-dong/tai-khoan');
  },
});

suite('C1 giao diện /cong-dong', {
  'khung nhẹ: không AppShell CLB, có tiêu đề': () => {
    assert.ok(layout, 'thiếu app/cong-dong/layout.js');
    assert.ok(!/AppShell/.test(layout), 'không dùng khung CLB');
    assert.ok(/community\.css/.test(layout));
    assert.ok(/metadata/.test(layout) && /Giải cộng đồng/.test(layout));
  },
  'trang tài khoản: hai tab, nhãn tiếng Việt, honeypot ẩn': () => {
    assert.ok(accountPage && account, 'thiếu trang tài khoản');
    assert.ok(/'use client'/.test(account));
    for (const label of ['Tạo tài khoản', 'Đăng nhập', 'Tên hiển thị', 'Số điện thoại', 'Mật khẩu', 'Nhập lại mật khẩu',
      'Thông tin thêm (không bắt buộc)', 'Giới tính', 'Ngày sinh', 'Trình độ PHR', 'Quên mật khẩu']) {
      assert.ok(account.includes(label), `thiếu nhãn "${label}"`);
    }
    assert.ok(/role="tablist"/.test(account) && /role="tab"/.test(account));
    assert.ok(/name="company"/.test(account) && /tabIndex=\{-1\}/.test(account) && /aria-hidden="true"/.test(account), 'honeypot ẩn');
    assert.ok(/\/api\/player\/accounts/.test(account) && /\/api\/player\/session/.test(account));
    assert.ok(/const next = safeNext\(params\.get\('next'\)\)/.test(account), 'điều hướng sau đăng nhập phải qua safeNext');
    assert.ok(!/router\.(push|replace)\(\s*(params|searchParams)/.test(account), 'không điều hướng thẳng theo giá trị chưa kiểm');
    assert.ok(/không đúng|error/.test(account));
  },
  'trang tài khoản: mật khẩu nhập lại phải khớp, không gọi Supabase': () => {
    assert.ok(/Mật khẩu nhập lại không khớp/.test(account));
    assert.ok(!/supabase/i.test(account));
  },
  'trang hồ sơ: cần phiên, đổi mật khẩu, đăng xuất': () => {
    assert.ok(profilePage && profile, 'thiếu trang hồ sơ');
    assert.ok(/\/api\/player\/profile/.test(profile));
    assert.ok(/\/api\/player\/session/.test(profile) && /method: 'DELETE'/.test(profile));
    for (const label of ['Đăng xuất', 'Mật khẩu hiện tại', 'Mật khẩu mới', 'Lưu thay đổi', 'Đổi mật khẩu']) {
      assert.ok(profile.includes(label), `thiếu nhãn "${label}"`);
    }
    assert.ok(/401/.test(profile) && /\/cong-dong\/tai-khoan/.test(profile), '401 → về trang đăng nhập');
  },
  'trang admin hệ thống: chỉ đăng nhập, không đăng ký': () => {
    assert.ok(adminPage && adminLogin, 'thiếu trang quản trị');
    assert.ok(/\/api\/platform\/session/.test(adminLogin));
    assert.ok(/Đăng nhập quản trị/.test(adminLogin) && /Tên đăng nhập/.test(adminLogin) && /Chỉ dành cho tài khoản do PickHub cấp/.test(adminLogin));
    assert.ok(!/Tạo tài khoản|Đăng ký/.test(adminLogin + adminPage));
    assert.ok(/getValidatedPlatformSessionFromCookies/.test(adminPage), 'trang render theo phiên admin phía server');
    assert.ok(/export const dynamic = 'force-dynamic'/.test(adminPage));
  },
  'CSS mobile-first: thẻ giữa 440px, breakpoint mobile, nút ≥ 44px': () => {
    assert.ok(css, 'thiếu community.css');
    assert.ok(/max-width:\s*440px/.test(css));
    assert.ok(/@media \(max-width: 480px\)/.test(css));
    assert.ok(/min-height:\s*44px/.test(css));
    assert.ok(/#7c3aed/i.test(css) && /#f8fafc/i.test(css), 'token brand + nền slate-50');
    assert.ok(/\.cd-honeypot/.test(css));
  },
  'không tiếng Anh lộ ra giao diện': () => {
    for (const code of [account, profile, adminLogin]) {
      const labels = [...code.matchAll(/>\s*([A-Za-zÀ-ỹ][^<>{}]{2,})\s*</g)].map((m) => m[1].trim());
      for (const text of labels) assert.ok(!/\b(Login|Sign in|Sign up|Password|Submit|Register|Logout)\b/.test(text), `chữ tiếng Anh: ${text}`);
    }
  },
});
