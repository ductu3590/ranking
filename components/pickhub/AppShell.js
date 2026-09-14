'use client';

import { useEffect, useState } from 'react';
import HomeHeader from '@/components/HomeHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import SideRail from './SideRail';
import AppTopBar from './AppTopBar';
import PhNotificationBell from './PhNotificationBell';
import './AppShell.css';

export default function AppShell({ children, layout = '' }) {
    const [role, setRole] = useState('member');
    const [club, setClub] = useState({ name: '', code: '', logoUrl: null, userName: '' });
    const [hasClubSession, setHasClubSession] = useState(false);
    // Vé VĐV thắng vé CLB ở thẻ người dùng: phiên CLB chỉ nói "CLB nào", còn vé VĐV
    // nói "ai". Đăng nhập bằng tài khoản VĐV rồi mà rail vẫn hiện "Thành viên" chung
    // thì người dùng không biết mình đang là ai.
    const [athlete, setAthlete] = useState(null);

    useEffect(() => {
        let active = true;

        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (!active) return;
                const sessionRole = payload?.session?.role;
                // athlete_session mở quyền xem CLB tương đương member; không gộp thành
                // admin. Nav dùng role member để hiện mục Thông tin.
                if (payload?.permissions?.canViewClub && ['admin', 'member', 'athlete'].includes(sessionRole)) {
                    setRole(sessionRole === 'athlete' ? 'member' : sessionRole);
                    setHasClubSession(sessionRole !== 'athlete');
                } else {
                    setHasClubSession(false);
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

        // Route này tự trả {account:null} khi vé hỏng/hết hạn nên không cần bắt lỗi riêng.
        fetch('/api/identity/athlete-sessions', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (!active || !payload?.account) return;
                setAthlete(payload.account);
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
        <div className={`ph-shell${layout ? ` ph-shell--${layout}` : ''}`}>
            <div className="ph-shell__body">
                <SideRail
                    role={role}
                    clubName={club.name}
                    clubLogoUrl={club.logoUrl}
                    userName={athlete?.displayName || club.userName}
                    athlete={athlete}
                    canLogout={hasClubSession}
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
