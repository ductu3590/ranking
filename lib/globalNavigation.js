const PRIMARY_NAV_LINKS = [
    { href: '/quy', label: 'Quỹ', icon: '💰' },
    { href: '/thanh-vien', label: 'Thành viên', icon: '👥' },
    { href: '/bxh', label: 'BXH', icon: '🥇', featured: true },
    { href: '/giai-dau', label: 'Giải', icon: '🏆' },
];

const MEMBER_INFO_LINK = { href: '/thong-tin', label: 'Thông tin', icon: '👤' };
const ADMIN_SETTINGS_LINK = { href: '/admin', label: 'Cấu hình', icon: '⚙️' };
const GLOBAL_NAV_LINKS = [...PRIMARY_NAV_LINKS, ADMIN_SETTINGS_LINK];

// Nhan breadcrumb suy ra tu pathname, khong truyen prop tu tung page.
// Thu tu trong mang khong con quan trong: xem BREADCRUMB_RULES_BY_SPECIFICITY.
const BREADCRUMB_RULES = [
    { prefix: '/thanh-vien/', label: 'Hồ sơ vận động viên' },
    { prefix: '/thanh-vien', label: 'Thành viên CLB' },
    { prefix: '/bxh', label: 'BXH đóng góp' },
    { prefix: '/giai-dau', label: 'Giải đấu' },
    { prefix: '/thong-tin', label: 'Hồ sơ cá nhân' },
    { prefix: '/dang-ky', label: 'Đăng ký tài khoản VĐV' },
    { prefix: '/admin', label: 'Cấu hình CLB' },
    { prefix: '/quy', label: 'Tổng quan quỹ' },
];

// Sap xep theo do dai prefix giam dan, tinh mot lan luc load module, de ket qua
// khong phu thuoc vao thu tu khai bao trong BREADCRUMB_RULES o tren.
const BREADCRUMB_RULES_BY_SPECIFICITY = [...BREADCRUMB_RULES].sort(
    (a, b) => b.prefix.length - a.prefix.length
);

// Duong dan co thuoc mot muc khong: trung khop tuyet doi, hoac la trang con.
// Phai co dau / o bien, neu khong "/quy-che" se bi coi la con cua "/quy".
function matchesSection(pathname, prefix) {
    if (pathname === prefix) return true;
    return pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

function getBreadcrumbLabel(pathname) {
    if (typeof pathname !== 'string' || !pathname) return '';
    const rule = BREADCRUMB_RULES_BY_SPECIFICITY.find((item) => matchesSection(pathname, item.prefix));
    return rule ? rule.label : '';
}

function isGlobalNavActive(pathname, href) {
    // Muc Quy chi sang o dung trang /quy, khong sang o trang con.
    if (href === '/quy') return pathname === href;
    return matchesSection(pathname, href);
}

function getGlobalNavLinksForRole(role) {
    if (role === 'admin') return GLOBAL_NAV_LINKS;
    return [...PRIMARY_NAV_LINKS, MEMBER_INFO_LINK];
}

module.exports = {
    GLOBAL_NAV_LINKS,
    getGlobalNavLinksForRole,
    getBreadcrumbLabel,
    isGlobalNavActive,
};
