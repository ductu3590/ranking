'use client';

import { useState, useEffect } from 'react';
import './live.css';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentGroupClient } from '@/lib/groupClient';
import UserStatusBadge from '@/components/UserStatusBadge';

export default function LiveTournament() {
    const [teams, setTeams] = useState([]);
    const [pairings, setPairings] = useState({ blue: {}, red: {} });
    const [matches, setMatches] = useState([]);
    const [scoreboard, setScoreboard] = useState(null);
    const [canRevealRound1, setCanRevealRound1] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState('guest'); // guest, admin
    const [editingScore, setEditingScore] = useState(null); // {matchId, blueScore, redScore}
    const [draggedPairing, setDraggedPairing] = useState(null);
    const [realtimeChannel, setRealtimeChannel] = useState(null);

    useEffect(() => {
        fetchData();

        // Setup Supabase Realtime subscription
        const channel = supabase
            .channel('tournament_live')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tournament_matches'
            }, (payload) => {
                console.log('[Realtime] tournament_matches changed:', payload);
                fetchMatches();
                fetchScoreboard();
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tournament_pairings'
            }, (payload) => {
                console.log('[Realtime] tournament_pairings changed:', payload);
                fetchPairings();
            })
            .subscribe();

        setRealtimeChannel(channel);

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        checkAuth();
    }, []);

    function checkAuth() {
        try {
            const group = getCurrentGroupClient();
            if (group.role === 'admin') {
                setUserRole('admin');
            }
        } catch (err) {
            console.error('Auth check error:', err);
        }
    }

    async function fetchData() {
        await Promise.all([
            fetchTeams(),
            fetchPairings(),
            fetchMatches(),
            fetchScoreboard()
        ]);
        setLoading(false);
    }

    async function fetchTeams() {
        try {
            const res = await fetch('/api/tournament/teams');
            const data = await res.json();
            if (data.success) {
                setTeams(data.teams);
            }
        } catch (err) {
            console.error('Error fetching teams:', err);
        }
    }

    async function fetchPairings() {
        try {
            const res = await fetch('/api/tournament/live/pairings', { cache: 'no-store' });
            const data = await res.json();
            if (data.success) {
                setPairings(data.pairings);
                setCanRevealRound1(data.canRevealRound1);
            }
        } catch (err) {
            console.error('Error fetching pairings:', err);
        }
    }

    async function fetchMatches() {
        try {
            const res = await fetch('/api/tournament/live/matches');
            const data = await res.json();
            if (data.success) {
                setMatches(data.matches);
            }
        } catch (err) {
            console.error('Error fetching matches:', err);
        }
    }

    async function fetchScoreboard() {
        try {
            const res = await fetch(`/api/tournament/live/scoreboard?t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            console.log('Scoreboard fetch result:', data);
            if (data.success) {
                console.log('Setting scoreboard:', data.scoreboard);
                setScoreboard(data.scoreboard);
            }
        } catch (err) {
            console.error('Error fetching scoreboard:', err);
        }
    }

    function renderPair(pairing) {
        if (!pairing) return '---';
        const p1 = pairing.player1?.player_name || '?';
        const p2 = pairing.player2?.player_name || '?';
        return `${formatName(p1)} + ${formatName(p2)}`;
    }

    function formatName(name) {
        if (!name) return '?';
        if (name.startsWith('KM - ')) return name;
        const parts = name.split(' ');
        return parts.slice(-2).join(' ');
    }

    function getMatchStatus(match) {
        if (match.match_status === 'completed') return '✅';
        if (match.match_status === 'live') return '🔴 LIVE';
        return '⏳';
    }

    async function updateScore(matchId, blueScore, redScore) {
        try {
            const res = await fetch('/api/tournament/live/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matchId,
                    blueScore: parseInt(blueScore),
                    redScore: parseInt(redScore),
                    status: 'completed'
                })
            });

            const data = await res.json();
            if (data.success) {
                await fetchMatches(); // Refresh data
                await fetchScoreboard(); // Update scoreboard
                setEditingScore(null);
            } else {
                alert('Lỗi cập nhật: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Update score error:', err);
            alert('Lỗi kết nối');
        }
    }

    async function deleteScore(matchId) {
        if (!confirm('Bạn có chắc chắn muốn xoá tỉ số trận này?')) return;

        try {
            const res = await fetch('/api/tournament/live/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matchId,
                    isReset: true
                })
            });

            const data = await res.json();
            if (data.success) {
                await fetchMatches(); // Refresh data
                await fetchScoreboard(); // Update scoreboard
                setEditingScore(null);
            } else {
                alert('Lỗi xoá: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Delete score error:', err);
            alert('Lỗi kết nối');
        }
    }

    // Drag and Drop handlers (Admin only)
    function handleDragStart(e, round, teamCode, pairing) {
        if (userRole !== 'admin') return;
        setDraggedPairing({ round, teamCode, pairing });
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragOver(e) {
        if (userRole !== 'admin') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    async function handleDrop(e, round, teamCode, targetPairing) {
        e.preventDefault();
        if (userRole !== 'admin' || !draggedPairing) return;

        if (draggedPairing.round !== round || draggedPairing.teamCode !== teamCode) {
            alert('Chỉ có thể sắp xếp lại trong cùng round và team!');
            setDraggedPairing(null);
            return;
        }

        const roundKey = `round${round}`;
        const currentList = pairings[teamCode]?.[roundKey];

        if (!currentList) {
            setDraggedPairing(null);
            return;
        }

        const teamPairings = [...currentList].sort((a, b) => a.pair_order - b.pair_order);

        const draggedIndex = teamPairings.findIndex(p => p.id === draggedPairing.pairing.id);
        const targetIndex = teamPairings.findIndex(p => p.id === targetPairing.id);

        if (draggedIndex === targetIndex) {
            setDraggedPairing(null);
            return;
        }

        const reordered = [...teamPairings];
        const [removed] = reordered.splice(draggedIndex, 1);
        reordered.splice(targetIndex, 0, removed);

        const newOrder = reordered.map((p, index) => ({
            id: p.id,
            pair_order: index + 1
        }));

        try {
            const res = await fetch('/api/tournament/admin/reorder', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ round, teamCode, newOrder })
            });

            const data = await res.json();
            if (data.success) {
                await Promise.all([fetchPairings(), fetchMatches()]);
                alert('Đã cập nhật thứ tự cặp đấu!');
            } else {
                alert('Lỗi sắp xếp: ' + data.error);
            }
        } catch (err) {
            console.error('Reorder error:', err);
            alert('Lỗi kết nối');
        }

        setDraggedPairing(null);
    }

    if (loading) {
        return (
            <div className="live-loading">
                <div className="spinner"></div>
                <p>Đang tải dữ liệu giải đấu...</p>
            </div>
        );
    }

    const blueTeam = teams.find(t => t.team_code === 'blue');
    const redTeam = teams.find(t => t.team_code === 'red');

    return (
        <div className="live-container">
                {/* Page Title Section */}
                <div className="live-title-section">
                    <h1>🎾 PICKLEBALL YEAR-END CUP - LIVE</h1>
                    <div className="live-indicator">
                        <span className="pulse"></span>
                        LIVE
                    </div>
                </div>

                {/* Scoreboard */}
                {scoreboard && (
                    <div className="scoreboard">
                        <div className="team-score blue-score">
                            <div className="team-name">TEAM XANH</div>
                            <div className="score-big">{scoreboard.blue.total}</div>
                            <div className="score-breakdown">
                                V1: {scoreboard.blue.round1} | V2: {scoreboard.blue.round2} | V3: {scoreboard.blue.round3}
                            </div>
                        </div>
                        <div className="vs-divider">VS</div>
                        <div className="team-score red-score">
                            <div className="team-name">TEAM ĐỎ</div>
                            <div className="score-big">{scoreboard.red.total}</div>
                            <div className="score-breakdown">
                                V1: {scoreboard.red.round1} | V2: {scoreboard.red.round2} | V3: {scoreboard.red.round3}
                            </div>
                        </div>
                    </div>
                )}

                {/* Team Rosters */}
                <div className="teams-section">
                    <div className="team-card blue-team">
                        <h2>TEAM XANH</h2>
                        <div className="player-list">
                            {blueTeam?.players.map((p, i) => (
                                <div key={p.id} className="player-item">
                                    {i + 1}. {p.player_name}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="team-card red-team">
                        <h2>TEAM ĐỎ</h2>
                        <div className="player-list">
                            {redTeam?.players.map((p, i) => (
                                <div key={p.id} className="player-item">
                                    {i + 1}. {p.player_name}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Pairings Display */}
                <div className="pairings-section">
                    <h2>📋 Cặp đôi các vòng</h2>

                    {/* Round 1 */}
                    <div className="round-pairings">
                        <h3>Vòng 1 - Bí Mật</h3>
                        <div className={`round-1-container ${!canRevealRound1 ? 'blurred-round' : ''}`}>
                            {!canRevealRound1 && (
                                <div className="blur-overlay">
                                    <div className="lock-message">
                                        🔒 Danh sách sẽ được mở khi Team ĐỎ nộp<br />hoặc sau 16:30
                                    </div>
                                </div>
                            )}
                            <div className="pairing-grid">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="pairing-row">
                                        <div className="pair-box blue-box">
                                            {pairings.blue.round1?.[i - 1] ? renderPair(pairings.blue.round1[i - 1]) : '---'}
                                        </div>
                                        <span className="vs-small">vs</span>
                                        <div className="pair-box red-box">
                                            {pairings.red.round1?.[i - 1] ? renderPair(pairings.red.round1[i - 1]) : '---'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Round 2 */}
                    <div className="round-pairings">
                        <h3>Vòng 2 - Thách Đấu {userRole === 'admin' && <span style={{ fontSize: '14px', color: '#10b981' }}>(Kéo thả để sắp xếp)</span>}</h3>
                        <div className="team-battle">
                            {/* BLUE team column - blur if not revealed */}
                            <div className={`round-1-container ${!canRevealRound1 ? 'blurred-round' : ''}`}>
                                {!canRevealRound1 && (
                                    <div className="blur-overlay" style={{ fontSize: '0.9rem' }}>
                                        <div className="lock-message-small">
                                            🔒 Ẩn đến khi ĐỎ nộp
                                        </div>
                                    </div>
                                )}
                                <div className="round2-column">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="round2-pair-row">
                                            <div
                                                className={`pair-box blue-box ${userRole === 'admin' ? 'draggable' : ''}`}
                                                draggable={userRole === 'admin' && canRevealRound1}
                                                onDragStart={(e) => pairings.blue.round2?.[i - 1] && handleDragStart(e, 2, 'blue', pairings.blue.round2[i - 1])}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => pairings.blue.round2?.[i - 1] && handleDrop(e, 2, 'blue', pairings.blue.round2[i - 1])}
                                            >
                                                {pairings.blue.round2?.[i - 1] ? renderPair(pairings.blue.round2[i - 1]) : '---'}
                                            </div>
                                            <span className="vs-small">vs</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* RED team column - no blur */}
                            <div className="round2-column">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="round2-pair-row">
                                        <div
                                            className={`pair-box red-box ${userRole === 'admin' ? 'draggable' : ''}`}
                                            draggable={userRole === 'admin'}
                                            onDragStart={(e) => pairings.red.round2?.[i - 1] && handleDragStart(e, 2, 'red', pairings.red.round2[i - 1])}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => pairings.red.round2?.[i - 1] && handleDrop(e, 2, 'red', pairings.red.round2[i - 1])}
                                        >
                                            {pairings.red.round2?.[i - 1] ? renderPair(pairings.red.round2[i - 1]) : '---'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Round 3 */}
                    <div className="round-pairings">
                        <h3>Vòng 3 - Super Team {userRole === 'admin' && <span style={{ fontSize: '14px', color: '#10b981' }}>(Kéo thả để sắp xếp)</span>}</h3>
                        <div className="team-battle">
                            {/* BLUE team - blur if not revealed */}
                            <div className={`round-1-container ${!canRevealRound1 ? 'blurred-round' : ''}`}>
                                {!canRevealRound1 && (
                                    <div className="blur-overlay" style={{ fontSize: '0.9rem' }}>
                                        <div className="lock-message-small">
                                            🔒 Ẩn đến khi ĐỎ nộp
                                        </div>
                                    </div>
                                )}
                                <div className="team-order blue-order">
                                    <h4>Thứ tự TEAM XANH:</h4>
                                    {[1, 2, 3, 4].map(i => (
                                        <div
                                            key={i}
                                            className={`order-item ${userRole === 'admin' ? 'draggable' : ''}`}
                                            draggable={userRole === 'admin' && canRevealRound1}
                                            onDragStart={(e) => pairings.blue.round3?.[i - 1] && handleDragStart(e, 3, 'blue', pairings.blue.round3[i - 1])}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => pairings.blue.round3?.[i - 1] && handleDrop(e, 3, 'blue', pairings.blue.round3[i - 1])}
                                        >
                                            {i}. {pairings.blue.round3?.[i - 1] ? renderPair(pairings.blue.round3[i - 1]) : '---'}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* RED team - no blur */}
                            <div className="team-order red-order">
                                <h4>Thứ tự TEAM ĐỎ:</h4>
                                {[1, 2, 3, 4].map(i => (
                                    <div
                                        key={i}
                                        className={`order-item ${userRole === 'admin' ? 'draggable' : ''}`}
                                        draggable={userRole === 'admin'}
                                        onDragStart={(e) => pairings.red.round3?.[i - 1] && handleDragStart(e, 3, 'red', pairings.red.round3[i - 1])}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => pairings.red.round3?.[i - 1] && handleDrop(e, 3, 'red', pairings.red.round3[i - 1])}
                                    >
                                        {i}. {pairings.red.round3?.[i - 1] ? renderPair(pairings.red.round3[i - 1]) : '---'}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Match Schedule & Results */}
                    <div className="matches-section">
                        <h2>⏱️ Lịch thi đấu & Kết quả</h2>
                        <table className="matches-table">
                            <thead>
                                <tr>
                                    <th>Giờ</th>
                                    <th>Sân</th>
                                    <th>Team XANH</th>
                                    <th>Tỷ số</th>
                                    <th>Team ĐỎ</th>
                                    <th>Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matches.map((match, index) => {
                                    // Determine match content based on match_type
                                    let blueDisplay, redDisplay;

                                    if (match.match_type === 'team') {
                                        // ALL TEAM match in Round 3
                                        blueDisplay = 'ALL TEAM XANH';
                                        redDisplay = 'ALL TEAM ĐỎ';
                                    } else {
                                        // Regular doubles match - get pairing from database
                                        // Use match.round_number and calculate pair index
                                        let round = match.round_number;

                                        // For round 1 and 2, matches 1-4 map to pair_order 1-4
                                        // match_number 1,2,3,4 => pair_order 1,2,3,4 (round 1)
                                        // match_number 5,6,7,8 => pair_order 1,2,3,4 (round 2)
                                        let pairIndex = ((match.match_number - 1) % 4);

                                        const bluePairing = pairings.blue[`round${round}`]?.[pairIndex];
                                        const redPairing = pairings.red[`round${round}`]?.[pairIndex];

                                        blueDisplay = bluePairing ? renderPair(bluePairing) : '---';
                                        redDisplay = redPairing ? renderPair(redPairing) : '---';
                                    }

                                    return (
                                        <tr key={match.id} className={`match-row ${match.match_status}`}>
                                            <td>{match.scheduled_time}</td>
                                            <td className="court-cell">Sân {match.court_number || 1}</td>
                                            <td className="team-cell blue-cell">
                                                {blueDisplay}
                                            </td>
                                            <td className="score-cell">
                                                {userRole === 'admin' ? (
                                                    editingScore?.matchId === match.id ? (
                                                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                            <input
                                                                type="number"
                                                                value={editingScore.blueScore}
                                                                onChange={(e) => setEditingScore({ ...editingScore, blueScore: e.target.value })}
                                                                style={{ width: '40px', padding: '4px', textAlign: 'center' }}
                                                                min="0"
                                                            />
                                                            <span>-</span>
                                                            <input
                                                                type="number"
                                                                value={editingScore.redScore}
                                                                onChange={(e) => setEditingScore({ ...editingScore, redScore: e.target.value })}
                                                                style={{ width: '40px', padding: '4px', textAlign: 'center' }}
                                                                min="0"
                                                            />
                                                            <button
                                                                onClick={() => updateScore(match.id, editingScore.blueScore, editingScore.redScore)}
                                                                style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                                                            >
                                                                ✓
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingScore(null)}
                                                                style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                                                            >
                                                                ✖
                                                            </button>
                                                            <button
                                                                onClick={() => deleteScore(match.id)}
                                                                style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', marginLeft: '4px' }}
                                                                title="Xoá tỉ số"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span
                                                            onClick={() => setEditingScore({ matchId: match.id, blueScore: match.blue_score || 0, redScore: match.red_score || 0 })}
                                                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                            className={match.winner_team === 'blue' ? 'winner-blue' : match.winner_team === 'red' ? 'winner-red' : ''}
                                                        >
                                                            {match.match_status === 'completed' || match.match_status === 'live' ? `${match.blue_score} - ${match.red_score}` : '- (Click để nhập)'}
                                                        </span>
                                                    )
                                                ) : (
                                                    match.match_status === 'completed' || match.match_status === 'live' ? (
                                                        <span className={match.winner_team === 'blue' ? 'winner-blue' : match.winner_team === 'red' ? 'winner-red' : ''}>
                                                            {match.blue_score} - {match.red_score}
                                                        </span>
                                                    ) : '-'
                                                )}
                                            </td>
                                            <td className="team-cell red-cell">
                                                {redDisplay}
                                            </td>
                                            <td className="status-cell">
                                                {getMatchStatus(match)}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    <div className="live-footer">
                        <p>⚡ Cập nhật tự động mỗi 10 giây</p>
                        <p>Giải đấu diễn ra: 17:00 - 20:05</p>
                    </div>
                </div>
        </div>
    );
}
