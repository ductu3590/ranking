'use client';

import { useEffect, useState } from 'react';
import { getCurrentGroupClient } from '@/lib/groupClient';
import './UserStatusBadge.css';

export default function UserStatusBadge() {
    const [state, setState] = useState({ kind: 'loading' });

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem('teamfund-current-group');
            if (stored) {
                const group = getCurrentGroupClient();
                setState({
                    kind: 'group',
                    name: group.name || 'Nhóm của tôi',
                    role: group.role === 'admin' ? 'admin' : 'member',
                });
                return;
            }
        } catch {
            window.localStorage.removeItem('teamfund-current-group');
        }

        setState({ kind: 'guest' });
    }, []);

    async function handleLogout() {
        try {
            await fetch('/api/groups/session', { method: 'DELETE' });
        } finally {
            window.location.href = '/';
        }
    }

    if (state.kind === 'loading') {
        return <div className="user-badge loading">...</div>;
    }

    if (state.kind === 'group') {
        const isAdmin = state.role === 'admin';
        const roleLabel = isAdmin ? 'Quản trị viên' : 'Thành viên';

        return (
            <details className="user-account-menu">
                <summary
                    className={`user-badge group-badge ${isAdmin ? 'admin-badge' : 'member-badge'}`}
                    title={`${state.name} · ${roleLabel}`}
                >
                    <span className="user-badge-group">{state.name}</span>
                    <span className="user-badge-role">{isAdmin ? '🔐' : '👤'} {roleLabel}</span>
                </summary>
                <div className="user-account-dropdown">
                    <button type="button" className="user-badge-logout" onClick={handleLogout}>
                        Đăng xuất
                    </button>
                </div>
            </details>
        );
    }

    return (
        <div className="user-badge guest-badge">
            👤 Khách
        </div>
    );
}
