'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import './UserStatusBadge.css';

export default function UserStatusBadge() {
    const [userRole, setUserRole] = useState('guest');
    const [teamCode, setTeamCode] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        try {
            const { data: { user }, error } = await supabase.auth.getUser();

            if (error || !user) {
                setUserRole('guest');
                setLoading(false);
                return;
            }

            const metadata = user.user_metadata || {};

            if (metadata.role === 'captain') {
                setUserRole('captain');
                setTeamCode(metadata.team);
            } else if (metadata.role === 'admin') {
                setUserRole('admin');
            } else {
                setUserRole('guest');
            }

            setLoading(false);
        } catch (err) {
            console.error('Auth check error:', err);
            setUserRole('guest');
            setLoading(false);
        }
    }

    if (loading) {
        return <div className="user-badge loading">⏳</div>;
    }

    if (userRole === 'admin') {
        return (
            <div className="user-badge admin-badge">
                🔐 Admin
            </div>
        );
    }

    if (userRole === 'captain') {
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
