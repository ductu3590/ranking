'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';
import UserStatusBadge from './UserStatusBadge';
import ClubSwitcher from './pickhub/ClubSwitcher';
import { readClubAccessContexts, readDefaultClubId } from '@/lib/clubAccessClient';
import './HomeHeader.css';

const { isGlobalNavActive } = navigation;

export default function HomeHeader() {
    const pathname = usePathname();
    const [branding, setBranding] = useState({ name: 'Pickhub', logoUrl: null });
    const [sessionView, setSessionView] = useState({ session: null, permissions: {}, loading: true });
    const [clubContexts, setClubContexts] = useState([]);
    const [defaultClubId, setDefaultClubId] = useState(null);

    useEffect(() => {
        let active = true;
        setClubContexts(readClubAccessContexts());
        setDefaultClubId(readDefaultClubId());
        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                if (active) setSessionView({ ...payload, loading: false });
            })
            .catch(() => {
                if (active) setSessionView({ session: null, permissions: {}, loading: false });
            });
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

    const role = sessionView.permissions?.canViewClub ? sessionView.session?.role : 'member';
    const navLinks = navigation.getGlobalNavLinksForRole(role);

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

                <ClubSwitcher
                    clubs={clubContexts}
                    defaultClubId={defaultClubId}
                    currentSession={sessionView.permissions?.canViewClub ? sessionView.session : null}
                />

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
                    <UserStatusBadge sessionView={sessionView} />
                </div>
            </div>
        </header>
    );
}
