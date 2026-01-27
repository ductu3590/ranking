'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import './captain.css';
import UserStatusBadge from '@/components/UserStatusBadge';

export default function CaptainDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [teamCode, setTeamCode] = useState(null);
    const [teamData, setTeamData] = useState(null);
    const [currentRound, setCurrentRound] = useState(1);
    const [pairings, setPairings] = useState([
        { pair_order: 1, player1_id: null, player2_id: null },
        { pair_order: 2, player1_id: null, player2_id: null },
        { pair_order: 3, player1_id: null, player2_id: null },
        { pair_order: 4, player1_id: null, player2_id: null }
    ]);
    const [submitStatus, setSubmitStatus] = useState({});
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Password Change State
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passError, setPassError] = useState('');
    const [passLoading, setPassLoading] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function initAuth() {
            try {
                const { data: { user }, error } = await supabase.auth.getUser();

                if (!mounted) return;

                if (error || !user) {
                    router.push('/login');
                    return;
                }

                const metadata = user.user_metadata || {};

                // Check role
                if (metadata.role !== 'captain') {
                    router.push('/');
                    return;
                }

                setUser(user);
                setTeamCode(metadata.team);

                // Check if password change is required
                if (!metadata.password_changed) {
                    setShowPasswordModal(true);
                }

                setLoading(false);
            } catch (err) {
                console.error('Auth error:', err);
                if (mounted) {
                    router.push('/login');
                }
            }
        }

        initAuth();

        return () => {
            mounted = false;
        };
    }, [router]);

    async function handleChangePassword(e) {
        e.preventDefault();
        setPassError('');
        setPassLoading(true);

        if (newPassword.length < 6) {
            setPassError('Mật khẩu phải có ít nhất 6 ký tự');
            setPassLoading(false);
            return;
        }

        if (newPassword !== confirmPassword) {
            setPassError('Mật khẩu xác nhận không khớp');
            setPassLoading(false);
            return;
        }

        try {
            // Update password
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
                data: { password_changed: true } // Mark as changed
            });

            if (updateError) throw updateError;

            alert('✅ Đổi mật khẩu thành công!');
            setShowPasswordModal(false);

            // Reload user to update metadata in state
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);

        } catch (err) {
            console.error('Change pass error:', err);
            setPassError(err.message || 'Lỗi khi đổi mật khẩu');
        } finally {
            setPassLoading(false);
        }
    }

    useEffect(() => {
        if (teamCode && !loading) {
            fetchTeamData();
            fetchPairings();
            checkSubmitStatus();
        }
    }, [teamCode, currentRound, loading]);

    async function fetchTeamData() {
        try {
            const res = await fetch('/api/tournament/teams');
            const data = await res.json();

            if (data.success) {
                const myTeam = data.teams.find(t => t.team_code === teamCode);
                setTeamData(myTeam);
            }
        } catch (err) {
            console.error('Error fetching team data:', err);
        }
    }

    async function fetchPairings() {
        try {
            const res = await fetch(`/api/tournament/captain/pairings?round=${currentRound}&team=${teamCode}`);
            const data = await res.json();

            if (data.success && data.pairings.length > 0) {
                setPairings(data.pairings);
            } else {
                // Reset to empty pairings
                setPairings([
                    { pair_order: 1, player1_id: null, player2_id: null },
                    { pair_order: 2, player1_id: null, player2_id: null },
                    { pair_order: 3, player1_id: null, player2_id: null },
                    { pair_order: 4, player1_id: null, player2_id: null }
                ]);
            }
        } catch (err) {
            console.error('Error fetching pairings:', err);
        }
    }

    async function checkSubmitStatus() {
        try {
            const res = await fetch(`/api/tournament/captain/pairings?round=${currentRound}&team=${teamCode}`);
            const data = await res.json();

            if (data.success && data.pairings.length > 0) {
                const status = data.pairings[0].status;
                setSubmitStatus(prev => ({ ...prev, [currentRound]: status }));
            }
        } catch (err) {
            console.error('Error checking status:', err);
        }
    }

    function updatePairing(pairIndex, field, value) {
        const newPairings = [...pairings];
        newPairings[pairIndex] = {
            ...newPairings[pairIndex],
            [field]: value ? parseInt(value) : null
        };
        setPairings(newPairings);
    }

    function getAvailablePlayers(currentPairIndex, currentField) {
        const selectedIds = pairings
            .map((pair, index) => {
                if (index === currentPairIndex) {
                    // For current pair, only exclude the OTHER field
                    return currentField === 'player1_id' ? pair.player2_id : pair.player1_id;
                }
                // For other pairs, exclude both players
                return [pair.player1_id, pair.player2_id];
            })
            .flat()
            .filter(id => id != null);

        return (teamData?.players || []).filter(p => !selectedIds.includes(p.id));
    }

    async function saveDraft() {
        setError('');
        setSuccess('');

        // Validate: all 4 pairs must have 2 players
        const invalidPairs = pairings.filter(p => !p.player1_id || !p.player2_id);
        if (invalidPairs.length > 0) {
            setError('Tất cả 4 cặp phải có đủ 2 người');
            return;
        }

        try {
            const res = await fetch('/api/tournament/captain/pairings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teamCode,
                    round: currentRound,
                    pairings: pairings.map((p, i) => ({
                        pair_order: i + 1,
                        player1_id: p.player1_id,
                        player2_id: p.player2_id
                    }))
                })
            });

            const data = await res.json();

            if (data.success) {
                setSuccess('✅ Lưu bản nháp thành công');
                fetchPairings();
            } else {
                setError(data.error || 'Lỗi khi lưu');
            }
        } catch (err) {
            setError('Lỗi kết nối');
        }
    }

    async function submitPairings() {
        setError('');
        setSuccess('');

        if (!window.confirm(`Xác nhận nộp danh sách Vòng ${currentRound}? Sau khi nộp sẽ không thể sửa.`)) {
            return;
        }

        try {
            // First save as draft
            await saveDraft();

            // Then submit
            const res = await fetch('/api/tournament/captain/pairings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teamCode,
                    round: currentRound
                })
            });

            const data = await res.json();

            if (data.success) {
                setSuccess('✅ Đã nộp danh sách thành công!');
                setSubmitStatus(prev => ({ ...prev, [currentRound]: 'submitted' }));
                fetchPairings();
            } else {
                setError(data.error || 'Lỗi khi nộp');
            }
        } catch (err) {
            setError('Lỗi kết nối');
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.push('/login');
    }

    if (loading) {
        return <div className="loading-screen">⏳ Đang tải...</div>;
    }

    // Password Change Modal
    if (showPasswordModal) {
        return (
            <div className="password-modal-overlay">
                <div className="password-modal">
                    <h2>🔒 Đổi Mật Khẩu Bắt Buộc</h2>
                    <p>Vì lý do bảo mật và khách quan, vui lòng đổi mật khẩu mới cho lần đăng nhập đầu tiên.</p>

                    <form onSubmit={handleChangePassword}>
                        <div className="form-group">
                            <label>Mật khẩu mới</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Nhập mật khẩu mới..."
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Xác nhận mật khẩu</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Nhập lại mật khẩu..."
                                required
                            />
                        </div>

                        {passError && <div className="error-text">{passError}</div>}

                        <button
                            type="submit"
                            className="btn-submit-pass"
                            disabled={passLoading}
                        >
                            {passLoading ? 'Đang xử lý...' : 'Cập nhật Mật khẩu'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const isSubmitted = submitStatus[currentRound] === 'submitted';
    const teamColor = teamCode === 'blue' ? '#3b82f6' : '#ef4444';

    return (
        <div className="captain-container" style={{ '--team-color': teamColor }}>
            <div className="captain-header">
                <div>
                    <h1>🎾 Captain Dashboard</h1>
                    <h2 className={`team-name team-${teamCode}`}>
                        {teamData?.team_name || 'Loading...'}
                    </h2>
                </div>
                <div className="header-actions">
                    <UserStatusBadge />
                    <a href="/tournament" className="btn-secondary" style={{ marginRight: '10px' }}>
                        📜 Điều lệ
                    </a>
                    <a href="/tournament/live" className="btn-secondary">
                        👁️ Xem Live
                    </a>
                    <button onClick={handleLogout} className="btn-logout">
                        🚪 Đăng xuất
                    </button>
                </div>
            </div>

            <div className="round-selector">
                {[1, 2, 3].map(round => (
                    <button
                        key={round}
                        className={`round-btn ${currentRound === round ? 'active' : ''} ${submitStatus[round] === 'submitted' ? 'submitted' : ''}`}
                        onClick={() => setCurrentRound(round)}
                    >
                        Vòng {round} {submitStatus[round] === 'submitted' && '✓'}
                    </button>
                ))}
            </div>

            {error && <div className="alert alert-error">⚠️ {error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="pairing-card">
                <h3>Sắp xếp cặp đôi - {currentRound === 3 ? 'Thứ tự thi đấu' : 'Ghép cặp'}</h3>

                {currentRound === 1 && (
                    <div className="round-info">
                        📌 Vòng 1: Danh sách sẽ được giữ bí mật đến 16:30
                    </div>
                )}
                {currentRound === 2 && (
                    <div className="round-info">
                        📌 Vòng 2: Phải đổi cặp mới, không được giữ nguyên cặp Vòng 1
                    </div>
                )}
                {currentRound === 3 && (
                    <div className="round-info">
                        📌 Vòng 3: Sắp xếp thứ tự 4 cặp (1→2→3→4) để xoay vòng
                    </div>
                )}

                <div className="pairings-list">
                    {pairings.map((pair, index) => (
                        <div key={index} className="pair-row">
                            <div className="pair-label">Cặp {index + 1}</div>

                            <select
                                value={pair.player1_id || ''}
                                onChange={(e) => updatePairing(index, 'player1_id', e.target.value)}
                                disabled={isSubmitted}
                                className="player-select"
                            >
                                <option value="">-- Chọn người 1 --</option>
                                {getAvailablePlayers(index, 'player1_id').map(player => (
                                    <option key={player.id} value={player.id}>
                                        {player.player_name}
                                    </option>
                                ))}
                                {pair.player1_id && (
                                    <option value={pair.player1_id}>
                                        {teamData?.players.find(p => p.id === pair.player1_id)?.player_name}
                                    </option>
                                )}
                            </select>

                            <span className="pair-divider">+</span>

                            <select
                                value={pair.player2_id || ''}
                                onChange={(e) => updatePairing(index, 'player2_id', e.target.value)}
                                disabled={isSubmitted}
                                className="player-select"
                            >
                                <option value="">-- Chọn người 2 --</option>
                                {getAvailablePlayers(index, 'player2_id').map(player => (
                                    <option key={player.id} value={player.id}>
                                        {player.player_name}
                                    </option>
                                ))}
                                {pair.player2_id && (
                                    <option value={pair.player2_id}>
                                        {teamData?.players.find(p => p.id === pair.player2_id)?.player_name}
                                    </option>
                                )}
                            </select>
                        </div>
                    ))}
                </div>

                <div className="action-buttons">
                    {!isSubmitted ? (
                        <>
                            <button onClick={saveDraft} className="btn-save">
                                💾 Lưu bản nháp
                            </button>
                            <button onClick={submitPairings} className="btn-submit">
                                📬 Nộp danh sách
                            </button>
                        </>
                    ) : (
                        <div className="submitted-badge">
                            ✅ Đã nộp danh sách Vòng {currentRound}
                        </div>
                    )}
                </div>
            </div>

            <div className="team-roster">
                <h4>Danh sách đội</h4>
                <div className="roster-grid">
                    {teamData?.players.map((player, i) => (
                        <div key={player.id} className="roster-item">
                            {i + 1}. {player.player_name}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
