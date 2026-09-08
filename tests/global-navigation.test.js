const assert = require('assert');

const { GLOBAL_NAV_LINKS, isGlobalNavActive } = require('../lib/globalNavigation');

assert.deepStrictEqual(
    GLOBAL_NAV_LINKS.map(({ href, label, icon }) => ({ href, label, icon })),
    [
        { href: '/quy', label: 'Quỹ', icon: '💰' },
        { href: '/quy/members', label: 'Thành viên', icon: '👥' },
        { href: '/quy/bxh', label: 'BXH', icon: '🥇' },
        { href: '/giai-dau', label: 'Giải', icon: '🏆' },
        { href: '/admin', label: 'Cấu hình', icon: '⚙️' },
    ],
    'Menu chính phải có đúng năm mục theo thứ tự đã duyệt.'
);

assert.strictEqual(isGlobalNavActive('/quy/bxh', '/quy/bxh'), true, 'BXH phải active trên trang chính.');
assert.strictEqual(isGlobalNavActive('/quy/bxh/chi-tiet', '/quy/bxh'), true, 'BXH phải active trên trang con.');
assert.strictEqual(isGlobalNavActive('/quy/members', '/quy'), false, 'Quỹ không được active trên trang Thành viên.');
assert.strictEqual(isGlobalNavActive('/giai-dau/v2/demo', '/giai-dau'), true, 'Giải phải active trên mọi trang giải đấu.');

const fs2 = require('fs');
const path2 = require('path');
const root2 = path2.resolve(__dirname, '..');
const shell = fs2.readFileSync(path2.join(root2, 'components/pickhub/AppShell.js'), 'utf8');
assert(/SideRail/.test(shell), 'AppShell phai render SideRail');
assert(/MobileBottomNav/.test(shell), 'AppShell phai render MobileBottomNav');

for (const page of ['app/admin/page.js', 'app/thong-tin/page.js']) {
    const src = fs2.readFileSync(path2.join(root2, page), 'utf8');
    assert(!/HomeHeader/.test(src), `${page} khong duoc tu render HomeHeader nua - shell nam o AppShell`);
}

console.log('global navigation contract ok');
