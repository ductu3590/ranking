'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { listTournaments } from '@/lib/tournamentV2Client';
import { getCurrentGroupClient } from '@/lib/groupClient';
import TournamentConsoleV2 from './console/TournamentConsoleV2';
import TournamentWizard from './TournamentWizard';
import './v2.css';

const STATUS_LABELS = {
    draft: 'Nháp',
    active: 'Đang diễn ra',
    completed: 'Hoàn thành',
};

const ENTRANT_TYPE_LABELS = {
    pair: 'Cặp đôi',
    team: 'Đội',
};

function formatDate(d) {
    if (!d) return '—';
    return d;
}

export default function TournamentV2Page() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const activeId = searchParams.get('t');

    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [creating, setCreating] = useState(false);

    async function load() {
        setLoading(true);
        setError('');
        try {
            const list = await listTournaments();
            setTournaments(Array.isArray(list) ? list : []);
        } catch (err) {
            setError(err.message || 'Không tải được danh sách giải đấu.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const group = getCurrentGroupClient();
        setIsAdmin(group.role === 'admin');
        load();
    }, []);

    function openTournament(id) {
        router.push(`/giai-dau/v2?t=${id}`);
    }

    function backToList() {
        router.push('/giai-dau/v2');
    }

    function handleWizardDone(id) {
        setCreating(false);
        load();
        if (id) openTournament(id);
    }

    // --- Console view (đã chọn 1 giải) ---
    if (activeId) {
        return (
            <div className="v2-page">
                <button type="button" className="v2-back" onClick={backToList}>
                    ‹ Danh sách giải
                </button>
                <TournamentConsoleV2 tournamentId={activeId} />
            </div>
        );
    }

    // --- Wizard tạo giải ---
    if (creating) {
        return (
            <div className="v2-page">
                <button type="button" className="v2-back" onClick={() => setCreating(false)}>
                    ‹ Hủy tạo giải
                </button>
                <TournamentWizard onDone={handleWizardDone} />
            </div>
        );
    }

    // --- Danh sách giải ---
    return (
        <div className="v2-page">
            <header className="v2-list-header">
                <h1>Giải đấu</h1>
                {isAdmin ? (
                    <button type="button" className="v2-btn-primary" onClick={() => setCreating(true)}>
                        + Tạo giải
                    </button>
                ) : null}
            </header>

            {loading ? (
                <div className="v2-state v2-loading">
                    <span className="v2-spinner" aria-hidden="true" />
                    <p>Đang tải danh sách giải...</p>
                </div>
            ) : error ? (
                <div className="v2-state v2-error">
                    <p>{error}</p>
                    <button type="button" className="v2-btn-secondary" onClick={load}>
                        Thử lại
                    </button>
                </div>
            ) : tournaments.length === 0 ? (
                <div className="v2-state v2-empty">
                    <p>Chưa có giải đấu nào.</p>
                    {isAdmin ? (
                        <button type="button" className="v2-btn-primary" onClick={() => setCreating(true)}>
                            + Tạo giải đầu tiên
                        </button>
                    ) : null}
                </div>
            ) : (
                <ul className="v2-card-list">
                    {tournaments.map((t) => (
                        <li key={t.id}>
                            <button
                                type="button"
                                className="v2-card"
                                onClick={() => openTournament(t.id)}
                            >
                                <div className="v2-card-top">
                                    <span className={`v2-chip v2-chip-${t.status || 'draft'}`}>
                                        {STATUS_LABELS[t.status] || 'Nháp'}
                                    </span>
                                    <span className="v2-card-date">{formatDate(t.event_date)}</span>
                                </div>
                                <h2 className="v2-card-name">{t.name}</h2>
                                <p className="v2-card-meta">
                                    {ENTRANT_TYPE_LABELS[t.entrant_type] || 'Cặp đôi'}
                                    {t.location ? ` · ${t.location}` : ''}
                                </p>
                                <span className="v2-card-chevron" aria-hidden="true">›</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
