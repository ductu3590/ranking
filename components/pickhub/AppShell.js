'use client';

import { useEffect, useState } from 'react';
import HomeHeader from '@/components/HomeHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import SideRail from './SideRail';
import PhNotificationBell from './PhNotificationBell';
import './AppShell.css';

export default function AppShell({ children }) {
    const [role, setRole] = useState('member');

    useEffect(() => {
        let active = true;
        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                const sessionRole = payload?.session?.role;
                if (active && payload?.permissions?.canViewClub && ['admin', 'member'].includes(sessionRole)) {
                    setRole(sessionRole);
                }
            })
            .catch(() => {});
        return () => { active = false; };
    }, []);

    return (
        <div className="ph-shell">
            <HomeHeader trailing={role === 'admin' ? <PhNotificationBell /> : null} />
            <div className="ph-shell__body">
                <SideRail role={role} />
                <main className="ph-shell__main">{children}</main>
            </div>
            <MobileBottomNav />
        </div>
    );
}
