const assert = require('assert');
const navigation = require('../lib/globalNavigation');

const { getBreadcrumbLabel, getGlobalNavLinksForRole, isGlobalNavActive } = navigation;

assert.strictEqual(typeof getBreadcrumbLabel, 'function', 'Navigation phai xuat ham tra nhan breadcrumb.');

assert.strictEqual(getBreadcrumbLabel('/quy'), 'Tổng quan quỹ');
assert.strictEqual(getBreadcrumbLabel('/bxh'), 'BXH đóng góp');
assert.strictEqual(getBreadcrumbLabel('/thanh-vien'), 'Thành viên CLB');
assert.strictEqual(getBreadcrumbLabel('/thanh-vien/42'), 'Hồ sơ vận động viên');
assert.strictEqual(getBreadcrumbLabel('/giai-dau'), 'Giải đấu');
assert.strictEqual(getBreadcrumbLabel('/giai-dau/v2/console'), 'Giải đấu');
assert.strictEqual(getBreadcrumbLabel('/admin'), 'Cấu hình CLB');
assert.strictEqual(getBreadcrumbLabel('/thong-tin'), 'Hồ sơ cá nhân');
assert.strictEqual(getBreadcrumbLabel('/khong-ton-tai'), '', 'Duong dan la phai tra chuoi rong, khong duoc nem loi.');
assert.strictEqual(getBreadcrumbLabel(undefined), '', 'Pathname undefined phai tra chuoi rong.');

// Duong dan moi phai active dung
assert.strictEqual(isGlobalNavActive('/thanh-vien', '/thanh-vien'), true);
assert.strictEqual(isGlobalNavActive('/thanh-vien/42', '/thanh-vien'), true, 'Trang ho so phai lam sang muc Thanh vien.');
assert.strictEqual(isGlobalNavActive('/bxh', '/bxh'), true);
assert.strictEqual(isGlobalNavActive('/thanh-vien', '/quy'), false, 'Quy khong duoc active tren trang Thanh vien.');
assert.strictEqual(isGlobalNavActive('/bxh', '/quy'), false, 'Quy khong duoc active tren trang BXH.');

// Khong con duong dan cu
for (const links of [getGlobalNavLinksForRole('member'), getGlobalNavLinksForRole('admin')]) {
    for (const link of links) {
        assert(!link.href.startsWith('/quy/'), `Menu khong duoc con tro toi ${link.href}`);
    }
}

console.log('club space navigation contract ok');
