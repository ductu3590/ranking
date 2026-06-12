'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import './TournamentModuleNav.css';

export default function TournamentModuleNav() {
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
                console.error('Tournament module nav auth check error:', err);
            }
        }

        checkRole();

        return () => {
            active = false;
        };
    }, []);

    if (pathname === '/giai-dau') {
        return null;
    }

    const basePath = getTournamentBasePath(pathname);
    const links = [
        { href: basePath, label: 'Điều lệ', icon: '📜', roles: ['admin', 'captain', 'member', 'guest'] },
        { href: `${basePath}/live`, label: 'Live', icon: '🔴', roles: ['admin', 'captain', 'member', 'guest'] },
        { href: `${basePath}/captain`, label: 'Captain', icon: '👤', roles: ['guest'] },
        { href: '/admin?section=tournament', label: 'Admin', icon: '⚙️', roles: ['admin'] },
    ].filter((link) => link.roles.includes(userRole));

    return (
        <div className="tournament-module-nav-wrap">
            <nav className="tournament-module-nav" aria-label="Điều hướng module giải đấu">
                {links.map((link) => (
                    <a
                        key={link.href}
                        href={link.href}
                        className={`tournament-module-link ${isActivePath(pathname, link.href) ? 'active' : ''}`}
                    >
                        <span aria-hidden="true">{link.icon}</span>
                        <span>{link.label}</span>
                    </a>
                ))}
            </nav>
        </div>
    );
}

function getTournamentBasePath(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    const tournamentId = parts[1];

    if (parts[0] !== 'giai-dau' || !tournamentId || !/^\d+$/.test(tournamentId)) {
        return '/giai-dau/1';
    }

    return `/giai-dau/${tournamentId}`;
}

function isActivePath(pathname, href) {
    if (pathname === href) return true;
    if (/^\/giai-dau\/\d+$/.test(href)) return false;
    return pathname.startsWith(`${href}/`);
}
