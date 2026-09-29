'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Avatar } from './CommunityUi';
import { api, loginUrl } from './communityClient';

// Khu vực tài khoản trên thanh trên: đã đăng nhập → avatar + tên + "Đơn của tôi"; chưa → Đăng nhập / Tạo tài khoản.
// Ẩn trên các trang tài khoản (đã có tab đăng nhập) và trang quản trị hệ thống (có khung riêng).
export default function TopbarAccount() {
    const pathname = usePathname() || '';
    const [account, setAccount] = useState(undefined);

    useEffect(() => {
        let alive = true;
        api('/api/player/session').then((result) => { if (alive) setAccount(result.data?.account || null); });
        return () => { alive = false; };
    }, [pathname]);

    if (pathname.startsWith('/cong-dong/quan-tri') || pathname.startsWith('/cong-dong/tai-khoan')) return null;
    if (account === undefined) return <nav className="cd-topnav" aria-label="Tài khoản" />;
    if (!account) {
        return (
            <nav className="cd-topnav" aria-label="Tài khoản">
                <Link className="cd-btn cd-btn--ghost cd-btn--sm" href={loginUrl(pathname || '/cong-dong')}>Đăng nhập</Link>
                <Link className="cd-btn cd-btn--primary cd-btn--sm cd-hide-sm" href={loginUrl(pathname || '/cong-dong', 'tao')}>Tạo tài khoản</Link>
            </nav>
        );
    }
    return (
        <nav className="cd-topnav" aria-label="Tài khoản">
            <Link className="cd-link cd-hide-sm" href="/cong-dong/don-cua-toi">Đơn của tôi</Link>
            <Link className="cd-user" href="/cong-dong/tai-khoan/ho-so" aria-label={`Hồ sơ của ${account.displayName}`}>
                <Avatar name={account.displayName} />
                <span className="cd-user__name">{account.displayName}</span>
            </Link>
        </nav>
    );
}
