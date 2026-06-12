'use client';

import { useEffect, useState } from 'react';
import './dashboard.css';

export default function TournamentDashboard() {
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadTournaments();
    }, []);

    async function loadTournaments() {
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/tournaments', { cache: 'no-store' });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Không tải được danh sách giải đấu');
            }

            setTournaments(data.tournaments || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="tournament-dashboard">
            <section className="tournament-dashboard-header">
                <div>
                    <p className="dashboard-eyebrow">Giải đấu</p>
                    <h1>Danh sách giải đã tạo</h1>
                    <p>Chọn một giải để xem điều lệ, live, đội trưởng và quản trị.</p>
                </div>
                <a href="/giai-dau/1/admin" className="dashboard-action">
                    Quản trị giải
                </a>
            </section>

            {loading ? (
                <div className="dashboard-state">Đang tải danh sách giải đấu...</div>
            ) : error ? (
                <div className="dashboard-state dashboard-error">{error}</div>
            ) : tournaments.length === 0 ? (
                <div className="dashboard-state">Chưa có giải đấu nào.</div>
            ) : (
                <section className="tournament-card-grid">
                    {tournaments.map((tournament) => (
                        <a
                            key={tournament.id}
                            href={`/giai-dau/${tournament.id}`}
                            className="tournament-dashboard-card"
                        >
                            <div className="card-topline">
                                <span className={`status-pill status-${tournament.status || 'draft'}`}>
                                    {getStatusLabel(tournament.status)}
                                </span>
                                <span className="tournament-date">{formatDate(tournament.event_date)}</span>
                            </div>
                            <h2>{tournament.name}</h2>
                            <p>{tournament.description || 'Chưa có mô tả cho giải đấu này.'}</p>
                            <div className="card-meta">
                                <span>{tournament.location || 'Chưa có địa điểm'}</span>
                                <strong>Xem chi tiết</strong>
                            </div>
                        </a>
                    ))}
                </section>
            )}
        </main>
    );
}

function getStatusLabel(status) {
    const labels = {
        draft: 'Nháp',
        active: 'Đang diễn ra',
        completed: 'Hoàn thành',
    };

    return labels[status] || 'Nháp';
}

function formatDate(value) {
    if (!value) return 'Chưa có ngày';
    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(value));
}

