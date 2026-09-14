'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import navigation from '@/lib/globalNavigation';
import PhNotificationBell from './PhNotificationBell';

const { getGlobalNavLinksForRole, isGlobalNavActive } = navigation;

function initials(name) {
    if (!name) return 'CL';
    return name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

export default function SideRail({ role, clubName, clubLogoUrl, userName, memberCount, athlete = null, canLogout = false, onNavigate, onClose }) {
    const pathname = usePathname();
    const links = getGlobalNavLinksForRole(role);
    const isAdmin = role === 'admin';
    // Có vé VĐV thì thẻ người dùng nói tên người thật, và mở được menu tài khoản dù
    // không có phiên CLB nào (trước đây canLogout chỉ đúng cho phiên CLB).
    const hasAthlete = Boolean(athlete?.id);
    const showAccountMenu = canLogout || hasAthlete;
    const displayName = hasAthlete ? (athlete.displayName || athlete.login) : userName;
    const [accountOpen, setAccountOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const accountBtnRef = useRef(null);
    const accountMenuRef = useRef(null);

    /* Menu tai khoan tu dong dong khi bam ra ngoai (vd bam chuong thong bao),
       de khong bao gio co hai lop cung noi len. */
    useEffect(() => {
        if (!accountOpen) return undefined;
        function onPointerDown(event) {
            if (accountBtnRef.current?.contains(event.target)) return;
            if (accountMenuRef.current?.contains(event.target)) return;
            setAccountOpen(false);
        }
        function onKeyDown(event) {
            if (event.key === 'Escape') setAccountOpen(false);
        }
        document.addEventListener('mousedown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [accountOpen]);

    async function handleLogout() {
        setLoggingOut(true);
        try {
            await fetch('/api/groups/session', { method: 'DELETE' });
        } finally {
            window.location.assign('/');
        }
    }

    // Đăng xuất VĐV chỉ thu hồi vé VĐV, không chạm phiên CLB dùng chung trên máy đó.
    async function handleAthleteLogout() {
        setLoggingOut(true);
        try {
            await fetch('/api/identity/athlete-sessions', { method: 'DELETE' });
        } finally {
            window.location.assign('/');
        }
    }

    // tabIndex -1: duoi 1120px rail la drawer, mo ra thi AppShell doi tieu diem
    // vao day de ban phim va trinh doc man hinh di theo.
    return (
        <div className="ph-rail" id="ph-rail" tabIndex={-1}>
            <div className="ph-rail__brand">
                {clubLogoUrl
                    ? <img className="ph-rail__logo" src={clubLogoUrl} alt="" />
                    : <span className="ph-rail__mark" aria-hidden="true">{initials(clubName)}</span>}
                <span className="ph-rail__brandtext">
                    <span className="ph-rail__kicker">Câu lạc bộ</span>
                    <span className="ph-rail__name">{clubName || 'CLB của tôi'}</span>
                </span>
                {onClose && (
                    <button type="button" className="ph-rail__close" aria-label="Đóng menu điều hướng" onClick={onClose}>✕</button>
                )}
            </div>

            <nav className="ph-rail__nav" aria-label="Điều hướng chính">
                <span className="ph-rail__label">{isAdmin ? 'Menu quản lý' : 'Giao diện thành viên'}</span>
                {links.map((link) => {
                    const active = isGlobalNavActive(pathname, link.href);
                    return (
                        <a
                            key={link.href}
                            href={link.href}
                            className={`ph-rail__link${active ? ' is-active' : ''}`}
                            aria-current={active ? 'page' : undefined}
                            onClick={onNavigate}
                        >
                            <span className="ph-rail__ico" aria-hidden="true">{link.icon}</span>
                            <span className="ph-rail__txt">{link.label}</span>
                            {link.href === '/thanh-vien' && Number.isFinite(memberCount) && (
                                <span className="ph-rail__count">{memberCount}</span>
                            )}
                        </a>
                    );
                })}
            </nav>

            <div className="ph-usercard-wrap">
                <div className="ph-usercard">
                    {showAccountMenu ? (
                        <button type="button" ref={accountBtnRef} className="ph-usercard__account" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}>
                            <span className="ph-usercard__av" aria-hidden="true">{initials(displayName)}</span>
                            <span className="ph-usercard__body">
                                <span className="ph-usercard__name">{displayName || (isAdmin ? 'Quản trị viên' : 'Thành viên')}</span>
                                <span className="ph-usercard__role">{hasAthlete ? 'Tài khoản VĐV' : isAdmin ? 'Quản trị viên CLB' : 'Thành viên'}</span>
                            </span>
                            <span className="ph-usercard__caret" aria-hidden="true">⌄</span>
                        </button>
                    ) : <>
                        <span className="ph-usercard__av" aria-hidden="true">{initials(userName)}</span>
                        <span className="ph-usercard__body">
                            <span className="ph-usercard__name">Khách CLB</span>
                            <span className="ph-usercard__role">Chưa đăng nhập CLB</span>
                        </span>
                    </>}
                    {isAdmin ? <span className="ph-usercard__bell"><PhNotificationBell /></span> : <span className="ph-usercard__dot" aria-hidden="true" />}
                </div>
                {showAccountMenu && accountOpen ? <div className="ph-usercard__menu" role="menu" ref={accountMenuRef}>
                    {hasAthlete ? <>
                        <a role="menuitem" className="ph-usercard__link" href="/ho-so-vdv">Hồ sơ &amp; cài đặt của tôi</a>
                        <button type="button" role="menuitem" className="ph-usercard__logout" onClick={handleAthleteLogout} disabled={loggingOut}>{loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất tài khoản VĐV'}</button>
                    </> : null}
                    {!hasAthlete && canLogout ? <button type="button" role="menuitem" className="ph-usercard__logout" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}</button> : null}
                </div> : null}
            </div>
        </div>
    );
}
