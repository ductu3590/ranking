'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ChevronIcon } from '../CommunityUi';

const ROLE_LABELS = { community_admin: 'Quản trị cộng đồng', platform_admin: 'Quản trị hệ thống' };

function Icon({ d }) {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={d} />
        </svg>
    );
}

// Khung admin hệ thống (Epic 4 C2; Stitch PLA-02/03): PC có sidebar 256px, mobile có thanh trên + menu trượt.
// Chỉ đọc/xóa phiên admin hệ thống (platform_session) qua /api/platform/session*, không đụng phiên VĐV.
export default function AdminShell({ role, active, tournamentId = null, title, breadcrumb = null, lead = null, subtitle = null, actions = null, status = null, children }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);

    async function logout() {
        await fetch('/api/platform/session/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
        router.replace('/cong-dong/quan-tri');
        router.refresh();
    }

    const items = [
        { key: 'tournaments', label: 'Giải cộng đồng', href: '/cong-dong/quan-tri', icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3' },
    ];
    if (tournamentId) {
        items.push(
            { key: 'registrations', label: 'Đăng ký', href: `/cong-dong/quan-tri/giai/${tournamentId}/dang-ky`, icon: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01' },
            { key: 'settings', label: 'Cài đặt giải', href: `/cong-dong/quan-tri/giai/${tournamentId}/cai-dat`, icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
        );
    }

    return (
        <div className="ad-shell" data-menu-open={open}>
            <aside className="ad-sidebar" aria-label="Điều hướng quản trị">
                <div className="ad-brand">
                    <span className="cd-logo" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>
                    </span>
                    <div>
                        <strong>PickHub</strong>
                        <span className="ad-brand__tag">Quản trị hệ thống</span>
                    </div>
                </div>
                <nav className="ad-nav">
                    {items.map((item) => (
                        <Link key={item.key} href={item.href} className="ad-nav__item" aria-current={active === item.key ? 'page' : undefined} onClick={() => setOpen(false)}>
                            <Icon d={item.icon} />
                            {item.label}
                        </Link>
                    ))}
                </nav>
                <div className="ad-account">
                    <span className="cd-avatar" aria-hidden="true">A</span>
                    <span className="ad-account__name">{ROLE_LABELS[role] || 'Quản trị'}</span>
                    <button type="button" className="ad-logout" onClick={logout}>
                        <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                        Đăng xuất
                    </button>
                </div>
            </aside>

            <div className="ad-main">
                {breadcrumb || status ? (
                    <div className="ad-crumbbar">
                        <nav className="ad-crumb" aria-label="Đường dẫn">
                            {String(breadcrumb || '').split(' / ').filter(Boolean).map((part, index, all) => (
                                <span key={`${part}-${index}`} data-last={index === all.length - 1 || undefined}>
                                    {part}{index < all.length - 1 ? <ChevronIcon /> : null}
                                </span>
                            ))}
                        </nav>
                        {status}
                    </div>
                ) : null}
                <header className="ad-topbar">
                    <button type="button" className="ad-menubtn" aria-label="Mở menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                        <Icon d="M4 6h16M4 12h16M4 18h16" />
                    </button>
                    <div className="ad-topbar__text">
                        <h1 className="ad-title">{title}</h1>
                        {lead ? <p className="ad-lead">{lead}</p> : null}
                        {subtitle ? <p className="ad-subtitle">{subtitle}</p> : null}
                    </div>
                    {actions ? <div className="ad-topbar__actions">{actions}</div> : null}
                </header>
                <div className="ad-content">{children}</div>
            </div>
            {open ? <button type="button" className="ad-scrim" aria-label="Đóng menu" onClick={() => setOpen(false)} /> : null}
        </div>
    );
}
