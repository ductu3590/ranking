'use client';

import { useEffect, useState } from 'react';
import HomeHeader from '@/components/HomeHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import SideRail from './SideRail';
import AppTopBar from './AppTopBar';
import PhNotificationBell from './PhNotificationBell';
import './AppShell.css';

export default function AppShell({ children }) {
    const [role, setRole] = useState('member');
    const [club, setClub] = useState({ name: '', code: '', logoUrl: null, userName: '' });

    useEffect(() => {
        let active = true;

        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (!active) return;
                const sessionRole = payload?.session?.role;
                if (payload?.permissions?.canViewClub && ['admin', 'member'].includes(sessionRole)) {
                    setRole(sessionRole);
                }
                if (payload?.session) {
                    setClub((current) => ({
                        ...current,
                        name: payload.session.group_name || current.name,
                        code: payload.session.group_code || current.code,
                    }));
                }
            })
            .catch(() => {});

        fetch('/api/club/branding')
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (!active || !data) return;
                setClub((current) => ({
                    ...current,
                    name: data.name || current.name,
                    logoUrl: data.logoUrl || null,
                }));
            })
            .catch(() => {});

        return () => { active = false; };
    }, []);

    return (
        <div className="ph-shell">
            <div className="ph-shell__body">
                <SideRail
                    role={role}
                    clubName={club.name}
                    clubLogoUrl={club.logoUrl}
                    userName={club.userName}
                />
                <div className="ph-shell__col">
                    <HomeHeader trailing={role === 'admin' ? <span className="ph-shell__headerbell"><PhNotificationBell /></span> : null} />
                    <AppTopBar clubName={club.name} clubCode={club.code} />
                    <main className="ph-shell__main">{children}</main>
                </div>
            </div>
            <MobileBottomNav />
        </div>
    );
}
