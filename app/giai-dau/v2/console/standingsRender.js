'use client';

// Render BXH dùng chung cho console (StandingsTab) và trang công khai.
// Nhánh theo schedule_format: round_robin (bảng 13 field) vs knockout (placement list).

function entrantName(entrantsById, id) {
    if (id == null) return 'Chưa xác định';
    const e = entrantsById[String(id)];
    return e ? e.name : `#${id}`;
}

// Vòng tròn: gom theo group_label, mỗi bảng 1 sub-table.
function RoundRobinStandings({ rows, entrantsById }) {
    const groups = {};
    for (const r of rows) {
        const key = r.group_label || '';
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    }
    const labels = Object.keys(groups).sort();

    return (
        <div className="v2-standings">
            {labels.map((label) => {
                const grp = [...groups[label]].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
                return (
                    <div key={label || 'all'} className="v2-standings-group">
                        {label ? <h3 className="v2-standings-heading">Bảng {label}</h3> : null}
                        <div className="v2-standings-scroll">
                            <table className="v2-standings-table">
                                <thead>
                                    <tr>
                                        <th>Hạng</th>
                                        <th className="v2-st-name">Đội</th>
                                        <th>Trận</th>
                                        <th>T</th>
                                        <th>B</th>
                                        <th>Hiệu số</th>
                                        <th>Điểm</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {grp.map((r) => (
                                        <tr key={r.entrant_id}>
                                            <td>{r.rank}</td>
                                            <td className="v2-st-name">{entrantName(entrantsById, r.entrant_id)}</td>
                                            <td>{r.played}</td>
                                            <td>{r.won}</td>
                                            <td>{r.lost}</td>
                                            <td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                                            <td className="v2-st-pts">{r.match_points}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Knockout: exit_round cao nhất = Vô địch, kế tiếp = Á quân, rồi Bán kết/Tứ kết...
function koLabel(exitRound, maxExit) {
    if (exitRound == null) return 'Chưa xác định';
    const depth = maxExit - exitRound; // 0 = vô địch
    if (depth <= 0) return 'Vô địch';
    if (depth === 1) return 'Á quân';
    if (depth === 2) return 'Bán kết';
    if (depth === 3) return 'Tứ kết';
    return `Vòng ${exitRound}`;
}

function KnockoutStandings({ rows, entrantsById }) {
    const maxExit = rows.reduce((m, r) => Math.max(m, r.exit_round ?? 0), 0);
    const sorted = [...rows].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

    return (
        <div className="v2-standings">
            <ul className="v2-placement-list">
                {sorted.map((r) => (
                    <li key={r.entrant_id} className="v2-placement-item">
                        <span className="v2-placement-rank">{r.rank}</span>
                        <span className="v2-placement-name">{entrantName(entrantsById, r.entrant_id)}</span>
                        <span className="v2-placement-label">{koLabel(r.exit_round, maxExit)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function StandingsView({ scheduleFormat, rows, entrantsById }) {
    if (!rows || !rows.length) {
        return (
            <div className="v2-state v2-empty">
                <p>Chưa có dữ liệu xếp hạng.</p>
            </div>
        );
    }
    if (scheduleFormat === 'knockout') {
        return <KnockoutStandings rows={rows} entrantsById={entrantsById} />;
    }
    return <RoundRobinStandings rows={rows} entrantsById={entrantsById} />;
}
