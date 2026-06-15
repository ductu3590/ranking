'use client';

import { useRouter } from 'next/navigation';

const FORMAT_LABELS = {
    mlp_team: 'MLP Team',
    doubles_round_robin: 'Đôi vòng tròn',
    group_playoff: 'Vòng bảng + Playoff',
    knockout: 'Loại trực tiếp',
};

const STATUS_FILTERS = [
    { value: 'all', label: 'Tất cả' },
    { value: 'active', label: 'Đang diễn ra' },
    { value: 'draft', label: 'Nháp' },
    { value: 'completed', label: 'Hoàn thành' },
];

export default function TournamentList({ tournaments, statusFilter, onFilter }) {
    const router = useRouter();
    const visible = statusFilter === 'all'
        ? tournaments
        : tournaments.filter((t) => (t.status || 'draft') === statusFilter);

    return (
        <div className="tournament-list-view">
            <div className="section-title-row">
                <div>
                    <h2>Giải đấu</h2>
                    <p>Chọn một giải để quản lý, hoặc tạo giải mới.</p>
                </div>
                <button
                    type="button"
                    className="btn-primary"
                    onClick={() => router.push('/admin?section=tournament&action=create')}
                >
                    + Tạo
                </button>
            </div>

            <div className="tournament-filter-chips">
                {STATUS_FILTERS.map((f) => (
                    <button
                        key={f.value}
                        type="button"
                        className={statusFilter === f.value ? 'chip active' : 'chip'}
                        onClick={() => onFilter(f.value)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="tournament-list">
                {visible.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        className="tournament-row"
                        onClick={() => router.push(`/admin?section=tournament&t=${t.id}`)}
                    >
                        <div className="tournament-row-main">
                            <div className="card-topline">
                                <span className={`status-pill status-${t.status || 'draft'}`}>
                                    {t.status || 'draft'}
                                </span>
                                <span>{t.event_date || '—'}</span>
                            </div>
                            <h3>{t.name}</h3>
                            <p>{FORMAT_LABELS[t.tournament_format] || 'MLP Team'} · {t.team_size || 4} VĐV/team</p>
                        </div>
                        <span className="tournament-row-chevron" aria-hidden="true">›</span>
                    </button>
                ))}
                {visible.length === 0 ? <p className="empty-state">Chưa có giải đấu nào.</p> : null}
            </div>
        </div>
    );
}
