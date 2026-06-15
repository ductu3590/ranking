'use client';

import { useState } from 'react';

export default function TeamsTab({ tournament, fetchJson, overview, reloadOverview }) {
    const id = tournament.id;
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const teams = overview.teams || [];
    const isTeam = (tournament.tournament_format || 'mlp_team') === 'mlp_team';

    async function handleAutoAssign() {
        setBusy(true);
        const { res, data } = await fetchJson('/api/tournaments/auto-assign', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tournamentId: id,
                format: tournament.tournament_format || 'mlp_team',
                teamSize: tournament.team_size || 4,
                teamsPerMatch: tournament.teams_per_match || 2,
            }),
        });
        setBusy(false);
        if (!res.ok) { setNotice(data.error || 'Không chia được.'); return; }
        setNotice(isTeam ? 'Đã chia team ngẫu nhiên.' : 'Đã chia cặp ngẫu nhiên.');
        await reloadOverview();
    }

    return (
        <div className="tab-teams">
            <div className="section-title-row">
                <h2>Đội & VĐV</h2>
                <button type="button" className="btn-primary" disabled={busy} onClick={handleAutoAssign}>
                    {busy ? 'Đang chia...' : (isTeam ? 'Chia team ngẫu nhiên' : 'Chia cặp ngẫu nhiên')}
                </button>
            </div>
            {notice ? <p className="tournament-notice">{notice}</p> : null}
            <div className="teams-grid">
                {teams.map((team) => (
                    <div key={team.id} className={`team-card team-${team.team_code}`}>
                        <h3>{team.team_name}</h3>
                        <p className="team-players">{team.players?.length || 0} người chơi</p>
                        <ul className="team-player-list">
                            {(team.players || []).map((p) => <li key={p.id}>{p.player_name}</li>)}
                        </ul>
                    </div>
                ))}
                {teams.length === 0 ? <p className="empty-state">Chưa có đội nào. Bấm chia để tạo.</p> : null}
            </div>
        </div>
    );
}
