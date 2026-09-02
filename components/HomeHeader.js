'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';
import UserStatusBadge from './UserStatusBadge';
import './HomeHeader.css';

const { GLOBAL_NAV_LINKS, isGlobalNavActive } = navigation;

export default function HomeHeader({ showAdmin = true }) {
    const pathname = usePathname();
    const [branding, setBranding] = useState({ name: 'Pickhub', logoUrl: null });

    useEffect(() => {
        let active = true;
        function loadBranding() {
            fetch('/api/club/branding')
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                    if (active && data && data.name) {
                        setBranding({ name: data.name, logoUrl: data.logoUrl || null });
                    }
                })
                .catch(() => {});
        }
        loadBranding();
        window.addEventListener('branding-updated', loadBranding);
        return () => {
            active = false;
            window.removeEventListener('branding-updated', loadBranding);
        };
    }, []);

    const navLinks = showAdmin
        ? GLOBAL_NAV_LINKS
        : GLOBAL_NAV_LINKS.filter((link) => link.href !== '/admin');

    return (
        <header className="home-header">
            <div className="header-container">
                <div className="header-logo">
                    <a href="/quy">
                        {branding.logoUrl && (
                            <img className="header-logo-img" src={branding.logoUrl} alt={branding.name} />
                        )}
                        <h1>{branding.name}</h1>
                    </a>
                </div>

                <nav className="header-nav">
                    {navLinks.map((link) => {
                        const isActive = isGlobalNavActive(pathname, link.href);
                        return (
                            <a
                                key={link.href}
                                href={link.href}
                                className={`nav-link ${isActive ? 'active' : ''} ${link.featured ? 'featured' : ''}`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                <span className="nav-link-icon" aria-hidden="true">{link.icon}</span>
                                <span>{link.label}</span>
                            </a>
                        );
                    })}
                </nav>

                <div className="header-right">
                    <UserStatusBadge />
                </div>
            </div>
        </header>
    );
}
