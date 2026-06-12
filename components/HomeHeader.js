'use client';
import { usePathname } from 'next/navigation';
import UserStatusBadge from './UserStatusBadge';
import './HomeHeader.css';

export default function HomeHeader({ showAdmin = true }) {
    const pathname = usePathname();

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
                        <h1>🏓 PICKLEBALL 246 CLUB</h1>
                    </a>
                </div>

                <nav className="header-nav">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className={`nav-link ${pathname === link.href ? 'active' : ''} ${link.className || ''}`}
                        >
                            {link.label}
                        </a>
                    ))}
                    {showAdmin && (
                        <a href="/quy/admin" className={`nav-link admin-link ${pathname === '/quy/admin' ? 'active' : ''}`}>
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
