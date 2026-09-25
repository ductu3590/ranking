'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import HomeHeader from '@/components/HomeHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import SideRail from './SideRail';
import AppTopBar from './AppTopBar';
import PhNotificationBell from './PhNotificationBell';
import './AppShell.css';

// Trang công khai của giải (khán giả / VĐV quét QR tại sân) là trang độc lập, không có vỏ app CLB
// (spec Epic 2 E3, Stitch OPS-07): /giai-dau/v2/<slug> và /giai-dau/v2/<slug>/noi-dung/<id>.
const PUBLIC_TOURNAMENT_PATH = /^\/giai-dau\/v2\/[^/]+(\/noi-dung\/[^/]+)?\/?$/;

export function isBarePublicPath(pathname) {
    return PUBLIC_TOURNAMENT_PATH.test(String(pathname || ''));
}

export default function AppShell({ children, layout = '' }) {
    const pathname = usePathname();
    const [role, setRole] = useState('member');
    const [club, setClub] = useState({ name: '', code: '', logoUrl: null, userName: '' });
    const [hasClubSession, setHasClubSession] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const burgerRef = useRef(null);
    const closeDrawer = useCallback(() => setDrawerOpen(false), []);
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

    // Doi trang thi dong drawer. Cac link trong rail la <a> nen thuong tai lai
    // trang, nhung dieu huong client-side (router.push) thi khong.
    useEffect(() => { setDrawerOpen(false); }, [pathname]);

    useEffect(() => {
        if (!drawerOpen) return undefined;

        // Khoa cuon nen de ngon tay keo trong drawer khong lam troi trang duoi.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.getElementById('ph-rail')?.focus();

        function onKeyDown(event) {
            if (event.key === 'Escape') setDrawerOpen(false);
        }
        // Tu 1120px rail tro lai thanh sidebar co dinh: phai reset trang thai,
        // neu khong khoa cuon se treo lai o desktop.
        const desktop = window.matchMedia('(min-width: 1120px)');
        function onDesktop(event) {
            if (event.matches) setDrawerOpen(false);
        }

        document.addEventListener('keydown', onKeyDown, true);
        desktop.addEventListener('change', onDesktop);

        // Giu lai node nut ☰ ngay tu luc mo: den luc cleanup chay thi
        // burgerRef.current co the da tro sang node khac.
        const burger = burgerRef.current;
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown, true);
            desktop.removeEventListener('change', onDesktop);
            burger?.focus();
        };
    }, [drawerOpen]);

    if (isBarePublicPath(pathname)) return <main className="ph-shell-bare">{children}</main>;

    return (
        <div className={`ph-shell${layout ? ` ph-shell--${layout}` : ''}${drawerOpen ? ' is-drawer-open' : ''}`}>
            <div className="ph-shell__body">
                <SideRail
                    role={role}
                    clubName={club.name}
                    clubLogoUrl={club.logoUrl}
                    userName={athlete?.displayName || club.userName}
                    athlete={athlete}
                    canLogout={hasClubSession}
                    onNavigate={closeDrawer}
                    onClose={closeDrawer}
                />
                <div className="ph-shell__col">
                    <HomeHeader
                        leading={(
                            <button
                                type="button"
                                ref={burgerRef}
                                className="ph-burger"
                                aria-label={drawerOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
                                aria-expanded={drawerOpen}
                                aria-controls="ph-rail"
                                onClick={() => setDrawerOpen((open) => !open)}
                            >☰</button>
                        )}
                        trailing={role === 'admin' ? <span className="ph-shell__headerbell"><PhNotificationBell /></span> : null}
                    />
                    <AppTopBar clubName={club.name} clubCode={club.code} />
                    <main className="ph-shell__main">{children}</main>
                </div>
            </div>
            {/* Lop nen mo: bam ra ngoai de dong drawer (ban phim dung Esc). */}
            <div className="ph-shell__scrim" aria-hidden="true" onClick={closeDrawer} />
            <MobileBottomNav />
        </div>
    );
}
