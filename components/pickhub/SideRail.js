'use client';

import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';

const { getGlobalNavLinksForRole, isGlobalNavActive } = navigation;

export default function SideRail({ role }) {
    const pathname = usePathname();
    const links = getGlobalNavLinksForRole(role);

    return (
        <nav className="ph-rail" aria-label="Điều hướng chính">
            <span className="ph-rail__label">CLB của tôi</span>
            {links.map((link) => {
                const active = isGlobalNavActive(pathname, link.href);
                return (
                    <a
                        key={link.href}
                        href={link.href}
                        className={`ph-rail__link${active ? ' is-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                    >
                        <span aria-hidden="true">{link.icon}</span>
                        <span>{link.label}</span>
                    </a>
                );
            })}
        </nav>
    );
}
