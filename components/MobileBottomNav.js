'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';
import './MobileBottomNav.css';

const { getGlobalNavLinksForRole, isGlobalNavActive } = navigation;

export default function MobileBottomNav() {
    const pathname = usePathname();
    const [role, setRole] = useState('member');

    useEffect(() => {
        let active = true;

        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                const sessionRole = payload?.session?.role;
                if (active && ['admin', 'member'].includes(sessionRole)) {
                    setRole(sessionRole);
                }
            })
            .catch(() => {});

        return () => {
            active = false;
        };
    }, []);

    const navLinks = getGlobalNavLinksForRole(role);

    return (
        <nav className="mobile-bottom-nav" aria-label="Điều hướng chính trên mobile">
            {navLinks.map((link) => {
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
