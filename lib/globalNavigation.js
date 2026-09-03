const PRIMARY_NAV_LINKS = [
    { href: '/quy', label: 'Quỹ', icon: '💰' },
    { href: '/quy/members', label: 'Thành viên', icon: '👥' },
    { href: '/quy/bxh', label: 'BXH', icon: '🥇', featured: true },
    { href: '/giai-dau', label: 'Giải', icon: '🏆' },
];

const MEMBER_INFO_LINK = { href: '/thong-tin', label: 'Thông tin', icon: '👤' };
const ADMIN_SETTINGS_LINK = { href: '/admin', label: 'Cấu hình', icon: '⚙️' };
const GLOBAL_NAV_LINKS = [...PRIMARY_NAV_LINKS, ADMIN_SETTINGS_LINK];

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
    isGlobalNavActive,
};
