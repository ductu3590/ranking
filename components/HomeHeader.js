'use client';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import UserStatusBadge from './UserStatusBadge';
import './HomeHeader.css';

export default function HomeHeader({ showAdmin = true }) {
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);

    const navLinks = [
        { href: '/', label: '🏆 Bảng xếp hạng', icon: '🏆' },
        { href: '/transactions', label: '💰 Theo dõi quỹ', icon: '💰' },
        { href: '/tournament', label: '🏆 Giải Tất Niên', icon: '⚡', highlight: true },
    ];

    const toggleMenu = () => {
        setMenuOpen(!menuOpen);
    };

    const closeMenu = () => {
        setMenuOpen(false);
    };

    return (
        <header className="home-header">
            <div className="header-container">
                {/* Logo / Club Name */}
                <div className="header-logo">
                    <a href="/">
                        <h1>🏓 PICKLEBALL 246 CLUB</h1>
                    </a>
                </div>

                {/* Hamburger Menu Icon (Mobile) */}
                <button
                    className={`hamburger ${menuOpen ? 'open' : ''}`}
                    onClick={toggleMenu}
                    aria-label="Toggle menu"
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </button>

                {/* Navigation Links */}
                <nav className={`header-nav ${menuOpen ? 'open' : ''}`}>
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className={`nav-link ${pathname === link.href ? 'active' : ''} ${link.highlight ? 'highlight' : ''}`}
                            onClick={closeMenu}
                        >
                            {link.label}
                        </a>
                    ))}
                    {showAdmin && (
                        <a href="/admin" className="nav-link admin-link" onClick={closeMenu}>
                            ⚙️ Quản trị
                        </a>
                    )}
                </nav>

                {/* Right Section: User Badge */}
                <div className="header-right">
                    <UserStatusBadge />
                </div>
            </div>
        </header>
    );
}
