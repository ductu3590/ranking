'use client';

export default function OverviewTab({ overview }) {
    const s = overview.stats || {};
    const cards = [
        { icon: '👥', value: s.totalPlayers || 0, label: 'Người chơi' },
        { icon: '🎯', value: s.totalMatches || 0, label: 'Trận đấu' },
        { icon: '✅', value: s.completedMatches || 0, label: 'Hoàn thành' },
        { icon: '⏳', value: s.pendingSubmissions || 0, label: 'Chờ duyệt' },
    ];
    const matches = overview.matches || [];
    return (
        <div className="tab-overview">
            <div className="stats-grid">
                {cards.map((c) => (
                    <div key={c.label} className="stat-card">
                        <div className="stat-icon">{c.icon}</div>
                        <div className="stat-value">{c.value}</div>
                        <div className="stat-label">{c.label}</div>
                    </div>
                ))}
            </div>
            <div className="matches-summary">
                {[1, 2, 3].map((round) => {
                    const rm = matches.filter((m) => m.round_number === round);
                    const done = rm.filter((m) => m.match_status === 'completed').length;
                    const pct = rm.length ? (done / rm.length) * 100 : 0;
                    return (
                        <div key={round} className="round-summary">
                            <h3>Round {round}</h3>
                            <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                            <p>{done} / {rm.length} trận</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
