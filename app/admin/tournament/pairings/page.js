'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TournamentNavBar from '@/components/TournamentNavBar';
import './admin-pairings.css';

export default function AdminPairingsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [pairings, setPairings] = useState({
        blue: { round1: [], round2: [], round3: [] },
        red: { round1: [], round2: [], round3: [] }
    });
    const [locked, setLocked] = useState(false);
    const [activeRound, setActiveRound] = useState(1);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            // Fetch pairings
            const pairingsRes = await fetch('/api/tournament/admin/pairings');
            const pairingsData = await pairingsRes.json();

            if (pairingsData.pairings) {
                setPairings(pairingsData.pairings);
            }

            // Fetch lock status
            const lockRes = await fetch('/api/tournament/admin/toggle-pairings-lock');
            const lockData = await lockRes.json();
            setLocked(lockData.locked || false);

            setLoading(false);
        } catch (error) {
            console.error('Error fetching data:', error);
            setMessage('❌ Failed to load data');
            setLoading(false);
        }
    }

    async function toggleLock() {
        try {
            const res = await fetch('/api/tournament/admin/toggle-pairings-lock', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer admin-token' // In production, use real auth
                }
            });

            const data = await res.json();
            if (data.success) {
                setLocked(data.locked);
                setMessage(data.message);
                setTimeout(() => setMessage(''), 3000);
            }
        } catch (error) {
            console.error('Error toggling lock:', error);
            setMessage('❌ Failed to toggle lock');
        }
    }

    async function savePairings(team, roundNumber) {
        setSaving(true);
        try {
            const roundKey = `round${roundNumber}`;
            const roundPairings = pairings[team][roundKey];

            const res = await fetch('/api/tournament/admin/pairings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    team,
                    round_number: roundNumber,
                    pairings: roundPairings
                })
            });

            const data = await res.json();
            if (data.success) {
                setMessage(`✅ ${team.toUpperCase()} Round ${roundNumber} saved!`);
                setTimeout(() => setMessage(''), 3000);
            } else {
                setMessage('❌ ' + (data.error || 'Failed to save'));
            }
        } catch (error) {
            console.error('Error saving pairings:', error);
            setMessage('❌ Failed to save pairings');
        }
        setSaving(false);
    }

    function updatePairing(team, round, pairIndex, field, value) {
        setPairings(prev => {
            const newPairings = { ...prev };
            const roundKey = `round${round}`;
            newPairings[team][roundKey][pairIndex][field] = value;
            return newPairings;
        });
    }

    function renderPairingsEditor(team, roundNumber) {
        const roundKey = `round${roundNumber}`;
        const roundPairings = pairings[team]?.[roundKey] || [];

        if (roundPairings.length === 0) {
            return <div className="no-pairings">No pairings found</div>;
        }

        return (
            <div className="pairings-editor">
                {roundPairings.map((pair, idx) => (
                    <div key={idx} className="pair-row">
                        <div className="pair-label">Cặp {pair.pair_order}:</div>
                        <input
                            type="text"
                            value={pair.player1_name || ''}
                            onChange={(e) => updatePairing(team, roundNumber, idx, 'player1_name', e.target.value)}
                            className="player-input"
                            placeholder="Player 1"
                        />
                        <span className="vs">+</span>
                        <input
                            type="text"
                            value={pair.player2_name || ''}
                            onChange={(e) => updatePairing(team, roundNumber, idx, 'player2_name', e.target.value)}
                            className="player-input"
                            placeholder="Player 2"
                        />
                    </div>
                ))}
                <button
                    onClick={() => savePairings(team, roundNumber)}
                    className="btn-save"
                    disabled={saving}
                >
                    {saving ? 'Saving...' : `💾 Save ${team.toUpperCase()} Round ${roundNumber}`}
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <>
                <TournamentNavBar />
                <div className="admin-pairings-page">
                    <div className="loading">⏳ Loading...</div>
                </div>
            </>
        );
    }

    return (
        <>
            <TournamentNavBar />
            <div className="admin-pairings-page">
                <div className="page-header">
                    <h1>📝 Admin Pairings Management</h1>
                    <button onClick={() => router.push('/admin/tournament')} className="btn-back">
                        ← Back to Admin
                    </button>
                </div>

                {/* Lock Toggle */}
                <div className="lock-section">
                    <div className="lock-info">
                        <div>
                            <strong>Pairings Lock:</strong>
                            <div className="lock-description">
                                {locked
                                    ? 'Captains CANNOT edit pairings'
                                    : 'Captains CAN edit pairings'}
                            </div>
                        </div>
                    </div>

                    <div className="toggle-switch-container">
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={locked}
                                onChange={toggleLock}
                            />
                            <span className="slider">
                                <span className="toggle-text text-on">ON</span>
                                <span className="toggle-text text-off">OFF</span>
                            </span>
                        </label>
                    </div>
                </div>

                {message && <div className="message">{message}</div>}

                {/* Round Tabs */}
                <div className="round-tabs">
                    {[1, 2, 3].map(round => (
                        <button
                            key={round}
                            onClick={() => setActiveRound(round)}
                            className={`round-tab ${activeRound === round ? 'active' : ''}`}
                        >
                            Round {round}
                        </button>
                    ))}
                </div>

                {/* Two Column Layout */}
                <div className="teams-container">
                    <div className="team-panel blue-panel">
                        <h2>🔵 BLUE TEAM</h2>
                        {renderPairingsEditor('blue', activeRound)}
                    </div>

                    <div className="team-panel red-panel">
                        <h2>🔴 RED TEAM</h2>
                        {renderPairingsEditor('red', activeRound)}
                    </div>
                </div>
            </div>
        </>
    );
}
