'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import './UserStatusBadge.css';

export default function UserStatusBadge() {
    const [state, setState] = useState({ kind: 'loading' });

    useEffect(() => {
        // 1. Group session (multi-club flow) takes priority.
        try {
            const stored = window.localStorage.getItem('teamfund-current-group');
            if (stored) {
                const group = JSON.parse(stored);
                if (group?.role) {
                    setState({
                        kind: 'group',
                        name: group.name || 'Nhóm của tôi',
                        role: group.role === 'admin' ? 'admin' : 'member',
                    });
                    return;
                }
            }
        } catch {
            window.localStorage.removeItem('teamfund-current-group');
        }

        // 2. Fall back to the legacy Supabase session (tournament captain flow).
        checkSupabaseAuth();
    }, []);

    async function checkSupabaseAuth() {
        try {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) {
                setState({ kind: 'guest' });
                return;
            }

            const metadata = user.user_metadata || {};
            if (metadata.role === 'captain') {
                setState({ kind: 'captain', team: metadata.team });
            } else if (metadata.role === 'admin') {
                setState({ kind: 'group', name: 'Quản trị', role: 'admin' });
            } else {
                setState({ kind: 'guest' });
            }
        } catch (err) {
            console.error('Auth check error:', err);
            setState({ kind: 'guest' });
        }
    }

    if (state.kind === 'loading') {
        return <div className="user-badge loading">⏳</div>;
    }

    if (state.kind === 'group') {
        const isAdmin = state.role === 'admin';
        const roleLabel = isAdmin ? 'Quản trị viên' : 'Thành viên';
        return (
            <div
                className={`user-badge group-badge ${isAdmin ? 'admin-badge' : 'member-badge'}`}
                title={`${state.name} · ${roleLabel}`}
            >
                <span className="user-badge-group">{state.name}</span>
                <span className="user-badge-role">{isAdmin ? '🔐' : '👤'} {roleLabel}</span>
            </div>
        );
    }

    if (state.kind === 'captain') {
        const teamCode = state.team;
        const teamName = teamCode === 'blue' ? 'XANH' : teamCode === 'red' ? 'ĐỎ' : teamCode?.toUpperCase();
        return (
            <div className={`user-badge captain-badge captain-${teamCode}`}>
                👑 Đội trưởng {teamName}
            </div>
        );
    }

    return (
        <div className="user-badge guest-badge">
            👤 Khách
        </div>
    );
}
