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
// Thu tu quan trong: muc cu the hon phai dung truoc muc tong quat hon.
const BREADCRUMB_RULES = [
    { prefix: '/thanh-vien/', label: 'Hồ sơ vận động viên' },
    { prefix: '/thanh-vien', label: 'Thành viên CLB' },
    { prefix: '/bxh', label: 'BXH đóng góp' },
    { prefix: '/giai-dau', label: 'Giải đấu' },
    { prefix: '/thong-tin', label: 'Hồ sơ cá nhân' },
    { prefix: '/admin', label: 'Cấu hình CLB' },
    { prefix: '/quy', label: 'Tổng quan quỹ' },
];

function getBreadcrumbLabel(pathname) {
    if (typeof pathname !== 'string' || !pathname) return '';
    const rule = BREADCRUMB_RULES.find((item) => pathname === item.prefix || pathname.startsWith(item.prefix));
    return rule ? rule.label : '';
}

function isGlobalNavActive(pathname, href) {
    if (pathname === href) return true;
    if (href === '/quy') return false;
    return pathname.startsWith(`${href}/`);
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
