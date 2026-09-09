'use client';

import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';
import './AppTopBar.css';

const { getBreadcrumbLabel } = navigation;

export default function AppTopBar({ clubName, clubCode }) {
    const pathname = usePathname();
    const current = getBreadcrumbLabel(pathname);

    return (
        <header className="ph-topbar">
            <div className="ph-topbar__inner">
                <nav className="ph-crumb" aria-label="Vị trí hiện tại">
                    <span>CLB của tôi</span>
                    <span className="ph-crumb__sep" aria-hidden="true">/</span>
                    <span className="ph-crumb__cur">{current}</span>
                </nav>
                {clubName && (
                    <span className="ph-clubchip">
                        <i aria-hidden="true" />
                        {clubName}
                        {clubCode && <code>{clubCode}</code>}
                    </span>
                )}
            </div>
        </header>
    );
}
