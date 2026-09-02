const GLOBAL_NAV_LINKS = [
    { href: '/quy', label: 'Quỹ', icon: '💰' },
    { href: '/quy/members', label: 'Thành viên', icon: '👥' },
    { href: '/quy/bxh', label: 'BXH', icon: '🥇', featured: true },
    { href: '/giai-dau', label: 'Giải', icon: '🏆' },
    { href: '/admin', label: 'Cấu hình', icon: '⚙️' },
];

function isGlobalNavActive(pathname, href) {
    if (pathname === href) return true;
    if (href === '/quy') return false;
    return pathname.startsWith(`${href}/`);
}

function getGlobalNavLinksForRole(role) {
    if (role === 'admin') return GLOBAL_NAV_LINKS;
    return GLOBAL_NAV_LINKS.filter((link) => link.href !== '/admin');
}

module.exports = {
    GLOBAL_NAV_LINKS,
    getGlobalNavLinksForRole,
    isGlobalNavActive,
};
