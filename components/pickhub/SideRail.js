'use client';

import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';
import PhNotificationBell from './PhNotificationBell';

const { getGlobalNavLinksForRole, isGlobalNavActive } = navigation;

function initials(name) {
    if (!name) return 'CL';
    return name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

export default function SideRail({ role, clubName, clubLogoUrl, userName, memberCount }) {
    const pathname = usePathname();
    const links = getGlobalNavLinksForRole(role);
    const isAdmin = role === 'admin';

    return (
        <div className="ph-rail">
            <div className="ph-rail__brand">
                {clubLogoUrl
                    ? <img className="ph-rail__logo" src={clubLogoUrl} alt="" />
                    : <span className="ph-rail__mark" aria-hidden="true">{initials(clubName)}</span>}
                <span className="ph-rail__brandtext">
                    <span className="ph-rail__kicker">Câu lạc bộ</span>
                    <span className="ph-rail__name">{clubName || 'CLB của tôi'}</span>
                </span>
            </div>

            <nav className="ph-rail__nav" aria-label="Điều hướng chính">
                <span className="ph-rail__label">{isAdmin ? 'Menu quản lý' : 'Giao diện thành viên'}</span>
                {links.map((link) => {
                    const active = isGlobalNavActive(pathname, link.href);
                    return (
                        <a
                            key={link.href}
                            href={link.href}
                            className={`ph-rail__link${active ? ' is-active' : ''}`}
                            aria-current={active ? 'page' : undefined}
                        >
                            <span className="ph-rail__ico" aria-hidden="true">{link.icon}</span>
                            <span className="ph-rail__txt">{link.label}</span>
                            {link.href === '/thanh-vien' && Number.isFinite(memberCount) && (
                                <span className="ph-rail__count">{memberCount}</span>
                            )}
                        </a>
                    );
                })}
            </nav>

            <div className="ph-usercard">
                <span className="ph-usercard__av" aria-hidden="true">{initials(userName)}</span>
                <span className="ph-usercard__body">
                    <span className="ph-usercard__name">{userName || (isAdmin ? 'Quản trị viên' : 'Khách CLB')}</span>
                    <span className="ph-usercard__role">{isAdmin ? 'Quản trị viên CLB' : 'Thành viên'}</span>
                </span>
                {isAdmin
                    ? <span className="ph-usercard__bell"><PhNotificationBell /></span>
                    : <span className="ph-usercard__dot" aria-hidden="true" />}
            </div>
        </div>
    );
}
