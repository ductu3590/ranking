import { getTournaments } from '@/lib/tournaments';
import { getEffectiveGroupContext } from '@/lib/groupSession';
import TournamentDashboardActions from './TournamentDashboardActions';
import './dashboard.css';

export default async function TournamentDashboard() {
    const { tournaments, fallback } = await getTournaments();
    const groupContext = getEffectiveGroupContext();
    const isAdmin = groupContext.role === 'admin';

    return (
        <main className="tournament-dashboard">
            <section className="tournament-dashboard-header">
                <div>
                    <p className="dashboard-eyebrow">Giải đấu</p>
                    <h1>Danh sách giải đã tạo</h1>
                    <p>Chọn một giải để xem điều lệ, live, đội trưởng và quản trị.</p>
                </div>
                {isAdmin ? (
                    <a href="/admin?section=tournament&action=create" className="dashboard-action">
                        Tạo giải đấu
                    </a>
                ) : null}
            </section>

            {fallback ? (
                <p className="dashboard-note">Đang dùng dữ liệu mặc định cho giải hiện tại.</p>
            ) : null}

            {tournaments.length === 0 ? (
                <div className="dashboard-state">Chưa có giải đấu nào.</div>
            ) : (
                <section className="tournament-card-grid">
                    {tournaments.map((tournament) => (
                        <article key={tournament.id} className="tournament-dashboard-card">
                            {isAdmin ? <TournamentDashboardActions tournament={tournament} /> : null}
                            <a href={`/giai-dau/${tournament.id}`} className="tournament-card-link">
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
                        </article>
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
