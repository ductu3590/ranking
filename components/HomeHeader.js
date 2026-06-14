'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import UserStatusBadge from './UserStatusBadge';
import './HomeHeader.css';

export default function HomeHeader({ showAdmin = true }) {
    const pathname = usePathname();
    const [branding, setBranding] = useState({ name: 'Pickleball 246 Club', logoUrl: null });

    useEffect(() => {
        let active = true;
        fetch('/api/club/branding')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (active && data && data.name) {
                    setBranding({ name: data.name, logoUrl: data.logoUrl || null });
                }
            })
            .catch(() => {});
        return () => { active = false; };
    }, []);

    const navLinks = [
        { href: '/quy', label: '💰 Quản lý quỹ' },
        { href: '/quy/members', label: '👥 Thành viên' },
        { href: '/giai-dau', label: '🏆 Giải đấu', className: 'tournament-link' },
    ];

    return (
        <header className="home-header">
            <div className="header-container">
                <div className="header-logo">
                    <a href="/quy">
                        {branding.logoUrl && (
                            <img className="header-logo-img" src={branding.logoUrl} alt={branding.name} />
                        )}
                        <h1>{branding.name.toUpperCase()}</h1>
                    </a>
                </div>

                <nav className="header-nav">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className={`nav-link ${isActivePath(pathname, link.href) ? 'active' : ''} ${link.className || ''}`}
                        >
                            {link.label}
                        </a>
                    ))}
                    {showAdmin && (
                        <a href="/admin" className={`nav-link admin-link ${isActivePath(pathname, '/admin') ? 'active' : ''}`}>
                            ⚙️ Quản trị
                        </a>
                    )}
                </nav>

                <div className="header-right">
                    <UserStatusBadge />
                </div>
            </div>
        </header>
    );
}

function isActivePath(pathname, href) {
    if (pathname === href) return true;
    if (href === '/giai-dau') return pathname.startsWith('/giai-dau/');
    if (href === '/quy') return false;
    return pathname.startsWith(`${href}/`);
}
