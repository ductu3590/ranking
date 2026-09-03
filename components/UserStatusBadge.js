'use client';

import { useEffect, useState } from 'react';
import './UserStatusBadge.css';

export default function UserStatusBadge({ sessionView: providedSessionView = null }) {
    const [state, setState] = useState({ kind: 'loading' });

    useEffect(() => {
        let active = true;
        if (providedSessionView) {
            const session = providedSessionView.session;
            if (providedSessionView.loading) setState({ kind: 'loading' });
            else if (providedSessionView.permissions?.canViewClub && session) {
                setState({
                    kind: 'group',
                    name: session.group_name || 'CLB của tôi',
                    role: session.role,
                });
            } else setState({ kind: 'guest' });
            return () => { active = false; };
        }
        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                if (!active) return;
                if (payload.permissions?.canViewClub && payload.session) {
                    setState({ kind: 'group', name: payload.session.group_name || 'CLB của tôi', role: payload.session.role });
                } else setState({ kind: 'guest' });
            })
            .catch(() => { if (active) setState({ kind: 'guest' }); });
        return () => { active = false; };
    }, [providedSessionView]);

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
