'use client';

const TEAM_LABELS = { blue: 'TEAM XANH', red: 'TEAM ĐỎ' };

export default function PairingsTab({ overview }) {
    const pairings = overview.pairings || [];
    const teams = overview.teams || [];
    const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
    const rounds = [1, 2, 3];

    return (
        <div className="tab-pairings">
            {/* read-only: editor will be rebuilt against the FK schema in a later round */}
            <p className="tournament-notice">Chế độ chỉ xem (read-only). Trình sắp cặp sẽ làm ở đợt sau.</p>
            {rounds.map((round) => {
                const rp = pairings.filter((p) => p.round_number === round);
                if (rp.length === 0) return null;
                return (
                    <div key={round} className="pairings-round">
                        <h3>Round {round}</h3>
                        <ul className="pairings-list">
                            {rp.map((p) => {
                                const team = teamById[p.team_id];
                                const code = team?.team_code;
                                const label = TEAM_LABELS[code] || team?.team_name || '—';
                                return (
                                    <li key={p.id}>
                                        <span className={`pairing-team team-${code}`}>{label}</span>
                                        <span>{p.player1?.player_name || '?'} &amp; {p.player2?.player_name || '?'}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}
            {pairings.length === 0 ? <p className="empty-state">Chưa có pairing nào.</p> : null}
        </div>
    );
}
