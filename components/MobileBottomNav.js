'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import './MobileBottomNav.css';

export default function MobileBottomNav({ area }) {
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

    const tabs = area === 'tournament' ? getTournamentTabs(userRole) : getFundTabs();
    const variantClass = area === 'tournament' ? 'mobile-bottom-nav-tournament' : 'mobile-bottom-nav-fund';
    const label = area === 'tournament' ? 'Điều hướng giải đấu trên mobile' : 'Điều hướng chính trên mobile';

    return (
        <nav className={`mobile-bottom-nav ${variantClass}`} aria-label={label}>
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
    if (href === '/quy' || href === '/giai-dau') return false;
    return pathname.startsWith(`${href}/`);
}

function getFundTabs() {
    return [
        { href: '/quy', label: 'Quỹ', icon: '💰' },
        { href: '/quy/members', label: 'TV', icon: '👥' },
        { href: '/giai-dau', label: 'Giải', icon: '🏆' },
        { href: '/quy/admin', label: 'Admin', icon: '⚙️' },
    ];
}

function getTournamentTabs(userRole) {
    const links = [
        { href: '/quy', label: 'Home', icon: '🏠', roles: ['admin', 'captain', 'member', 'guest'] },
        { href: '/giai-dau', label: 'Điều lệ', icon: '📜', roles: ['admin', 'captain', 'member', 'guest'] },
        { href: '/giai-dau/live', label: 'Live', icon: '🔴', roles: ['admin', 'captain', 'member', 'guest'] },
        { href: '/giai-dau/admin', label: 'Admin', icon: '⚙️', roles: ['admin'] },
        { href: '/giai-dau/captain', label: 'Captain', icon: '👤', roles: ['guest'] },
    ];

    return links.filter((link) => link.roles.includes(userRole)).slice(0, 4);
}
