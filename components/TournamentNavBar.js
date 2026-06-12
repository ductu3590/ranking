'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import './TournamentNavBar.css';

export default function TournamentNavBar() {
    const pathname = usePathname();
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState('guest');
    const [userName, setUserName] = useState('Khách');

    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user);
                const role = user.user_metadata?.role || 'member';
                setUserRole(role);
                setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');
            }
        } catch (err) {
            console.error('Auth check error:', err);
        }
    }

    async function handleLogout() {
        try {
            await supabase.auth.signOut();
            window.location.href = '/quy';
        } catch (err) {
            console.error('Logout error:', err);
        }
    }

    function getRoleBadge() {
        const badges = {
            admin: { text: 'ADMIN', color: 'badge-admin' },
            captain: { text: 'CAPTAIN', color: 'badge-captain' },
            member: { text: 'MEMBER', color: 'badge-member' },
            guest: { text: 'GUEST', color: 'badge-guest' }
        };
        const badge = badges[userRole] || badges.guest;
        return <span className={`role-badge ${badge.color}`}>{badge.text}</span>;
    }

    function getNavLinks() {
        const commonLinks = [
            { href: '/quy', label: '🏠 Trang chủ', roles: ['admin', 'captain', 'member', 'guest'] },
            { href: '/giai-dau', label: '📜 Điều lệ', roles: ['admin', 'captain', 'member', 'guest'] },
            { href: '/giai-dau/live', label: '🔴 Live', roles: ['admin', 'captain', 'member', 'guest'] },
        ];

        const roleLinks = [
            { href: '/giai-dau/admin', label: '⚙️ Admin Panel', roles: ['admin'] },
            { href: '/giai-dau/captain', label: '👤 Đăng nhập', roles: ['guest'] },
        ];

        return [...commonLinks, ...roleLinks].filter(link =>
            link.roles.includes(userRole)
        );
    }

    return (
        <nav className="tournament-navbar">
            <div className="navbar-container">
                <div className="navbar-brand">
                    <a href="/giai-dau">
                        <span className="brand-icon">🎾</span>
                        <span className="brand-text">PICKLEBALL CUP</span>
                    </a>
                </div>

                <div className="navbar-links desktop-only">
                    {getNavLinks().map(link => (
                        <a
                            key={link.href}
                            href={link.href}
                            className={`nav-link ${pathname === link.href ? 'active' : ''}`}
                        >
                            {link.label}
                        </a>
                    ))}
                </div>

                <div className="navbar-user">
                    {getRoleBadge()}
                    <div className="user-info">
                        <span className="user-name">{userName}</span>
                        {user && (
                            <button onClick={handleLogout} className="logout-btn">
                                Đăng xuất
                            </button>
                        )}
                    </div>
                </div>
            </div>

        </nav>
    );
}
