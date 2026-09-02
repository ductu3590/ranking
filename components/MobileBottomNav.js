'use client';

import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';
import './MobileBottomNav.css';

const { GLOBAL_NAV_LINKS, isGlobalNavActive } = navigation;

export default function MobileBottomNav() {
    const pathname = usePathname();

    return (
        <nav className="mobile-bottom-nav" aria-label="Điều hướng chính trên mobile">
            {GLOBAL_NAV_LINKS.map((link) => {
                const isActive = isGlobalNavActive(pathname, link.href);
                return (
                    <a
                        key={link.href}
                        href={link.href}
                        className={`mobile-bottom-nav-link ${isActive ? 'active' : ''} ${link.featured ? 'featured' : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                    >
                        <span className="mobile-bottom-nav-icon" aria-hidden="true">{link.icon}</span>
                        <span className="mobile-bottom-nav-label">{link.label}</span>
                    </a>
                );
            })}
        </nav>
    );
}
