'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import './MobileBottomNav.css';

export default function MobileBottomNav() {
    const pathname = usePathname();
    const [userRole, setUserRole] = useState('guest');

    useEffect(() => {
        let active = true;

        async function checkRole() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!active || !user) return;
                setUserRole(user.user_metadata?.role || 'member');
            } catch (err) {
                console.error('Mobile nav auth check error:', err);
            }
        }

        checkRole();

        return () => {
            active = false;
        };
    }, []);

    const tabs = getGlobalTabs(userRole);

    return (
        <nav className="mobile-bottom-nav" aria-label="Điều hướng chính trên mobile">
            {tabs.map((link) => (
                <a
                    key={link.href}
                    href={link.href}
                    className={`mobile-bottom-nav-link ${isActivePath(pathname, link.href) ? 'active' : ''}`}
                >
                    <span className="mobile-bottom-nav-icon" aria-hidden="true">{link.icon}</span>
                    <span className="mobile-bottom-nav-label">{link.label}</span>
                </a>
            ))}
        </nav>
    );
}

function isActivePath(pathname, href) {
    if (pathname === href) return true;
    if (href === '/giai-dau') return pathname.startsWith('/giai-dau/');
    if (href === '/quy') return false;
    return pathname.startsWith(`${href}/`);
}

function getGlobalTabs(userRole) {
    const tabs = [
        { href: '/quy', label: 'Quỹ', icon: '💰' },
        { href: '/quy/members', label: 'TV', icon: '👥' },
        { href: '/giai-dau', label: 'Giải', icon: '🏆' },
        { href: '/admin', label: 'Admin', icon: '⚙️', roles: ['admin', 'guest', 'member', 'captain'] },
    ];

    return tabs.filter((link) => !link.roles || link.roles.includes(userRole));
}
