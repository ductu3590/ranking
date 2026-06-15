'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentGroupClient } from '@/lib/groupClient';
import TournamentList from './components/TournamentList';
import TournamentForm from './components/TournamentForm';
import TournamentConsole from './components/TournamentConsole';
import './admin-tournament.css';

async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const { timeoutMs = 10000, ...fetchOptions } = options;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        return { res, data };
    } catch (error) {
        return { res: { ok: false }, data: { error: error.name === 'AbortError' ? 'Request timed out' : error.message } };
    } finally {
        clearTimeout(timeout);
    }
}

export default function AdminTournamentPanel({ embedded = false, tournamentId = '', tab = 'overview' }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [tournaments, setTournaments] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all');
    const [notice] = useState('');

    const action = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('action')
        : null;

    useEffect(() => {
        if (!embedded) { router.replace('/admin?section=tournament'); return; }
        const group = getCurrentGroupClient();
        if (group.role !== 'admin') { router.replace('/'); return; }
        loadTournaments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embedded, router]);

    async function loadTournaments() {
        setLoading(true);
        const { res, data } = await fetchJson('/api/tournaments');
        if (res.ok) setTournaments(data.tournaments || []);
        setLoading(false);
    }

    if (loading) return <div className="admin-tournament-loading">⏳ Đang tải...</div>;

    const current = tournaments.find((t) => String(t.id) === String(tournamentId));

    if (action === 'create' || (action === 'edit' && current)) {
        return (
            <div className="admin-tournament-container embedded">
                <TournamentForm
                    fetchJson={fetchJson}
                    editing={action === 'edit' ? current : null}
                    onDone={async () => { await loadTournaments(); router.push('/admin?section=tournament'); }}
                    onCancel={() => router.push('/admin?section=tournament')}
                />
            </div>
        );
    }

    if (tournamentId && current) {
        return (
            <div className="admin-tournament-container embedded">
                <TournamentConsole
                    tournament={current}
                    tab={tab}
                    fetchJson={fetchJson}
                    onTournamentsChanged={loadTournaments}
                />
            </div>
        );
    }

    return (
        <div className="admin-tournament-container embedded">
            {tournamentId && !current ? <p className="tournament-notice">Không tìm thấy giải đấu.</p> : null}
            {notice ? <p className="tournament-notice">{notice}</p> : null}
            <TournamentList tournaments={tournaments} statusFilter={statusFilter} onFilter={setStatusFilter} />
        </div>
    );
}

export { fetchJson };
