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

// Duong dan chi TRUNG TIEN TO chu khong phai trang con thi khong duoc an theo muc do
assert.strictEqual(getBreadcrumbLabel('/quy-che'), '', 'Tien to trung khong duoc coi la trang con cua /quy.');
assert.strictEqual(getBreadcrumbLabel('/bxh-cu'), '', 'Tien to trung khong duoc coi la trang con cua /bxh.');
assert.strictEqual(getBreadcrumbLabel('/admin-lich-su'), '', 'Tien to trung khong duoc coi la trang con cua /admin.');
assert.strictEqual(isGlobalNavActive('/thanh-vien-cu', '/thanh-vien'), false, 'Tien to trung khong duoc lam sang muc Thanh vien.');

// Khong con duong dan cu
for (const links of [getGlobalNavLinksForRole('member'), getGlobalNavLinksForRole('admin')]) {
    for (const link of links) {
        assert(!link.href.startsWith('/quy/'), `Menu khong duoc con tro toi ${link.href}`);
    }
}

console.log('club space navigation contract ok');
