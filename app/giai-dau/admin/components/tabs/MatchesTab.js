'use client';

export default function MatchesTab({ overview }) {
    const matches = overview.matches || [];
    const rounds = [1, 2, 3];
    return (
        <div className="tab-matches">
            {rounds.map((round) => {
                const rm = matches.filter((m) => m.round_number === round);
                if (rm.length === 0) return null;
                return (
                    <div key={round} className="matches-round">
                        <h3>Round {round}</h3>
                        <ul className="matches-list">
                            {rm.map((m) => (
                                <li key={m.id} className={`match-row match-${m.match_status}`}>
                                    <span>Trận {m.match_number}{m.court_number ? ` · Sân ${m.court_number}` : ''}</span>
                                    <span>{m.blue_score} - {m.red_score}</span>
                                    <span className="match-status">{m.match_status}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
            {matches.length === 0 ? <p className="empty-state">Chưa có trận đấu nào.</p> : null}
        </div>
    );
}
