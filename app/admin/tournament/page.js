'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import './admin-tournament.css';

export default function AdminTournamentPanel() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState(null);
    const [teams, setTeams] = useState([]);
    const [matches, setMatches] = useState([]);
    const [pairings, setPairings] = useState([]);
    const [stats, setStats] = useState({
        totalPlayers: 0,
        totalMatches: 0,
        completedMatches: 0,
        pendingSubmissions: 0
    });

    // Form state for settings
    const [settingsForm, setSettingsForm] = useState({
        tournament_name: '',
        tournament_date: '',
        start_time: '',
        end_time: '',
        total_courts: 2,
        match_duration_minutes: 15,
        break_duration_minutes: 5,
        round1_reveal_time: '',
        is_active: true
    });

    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || user.user_metadata?.role !== 'admin') {
            router.push('/login');
            return;
        }
        loadData();
    }

    async function loadData() {
        setLoading(true);
        await Promise.all([
            loadSettings(),
            loadTeams(),
            loadMatches(),
            loadPairings(),
            loadStats()
        ]);
        setLoading(false);
    }

    async function loadSettings() {
        const res = await fetch('/api/tournament/admin/settings');
        const data = await res.json();
        if (data.settings) {
            setSettings(data.settings);
            setSettingsForm({
                tournament_name: data.settings.tournament_name || '',
                tournament_date: data.settings.tournament_date?.split('T')[0] || '',
                start_time: data.settings.start_time || '',
                end_time: data.settings.end_time || '',
                total_courts: data.settings.total_courts || 2,
                match_duration_minutes: data.settings.match_duration_minutes || 15,
                break_duration_minutes: data.settings.break_duration_minutes || 5,
                round1_reveal_time: data.settings.round1_reveal_time || '',
                is_active: data.settings.is_active ?? true
            });
        }
    }

    async function loadTeams() {
        const res = await fetch('/api/tournament/teams');
        const data = await res.json();
        if (data.teams) {
            setTeams(data.teams);
        }
    }

    async function loadMatches() {
        const { data } = await supabase
            .from('tournament_matches')
            .select('*')
            .order('round', { ascending: true })
            .order('match_order', { ascending: true });

        setMatches(data || []);
    }

    async function loadPairings() {
        const { data } = await supabase
            .from('tournament_pairings')
            .select(`
                *,
                player1:tournament_players!tournament_pairings_player1_id_fkey(full_name),
                player2:tournament_players!tournament_pairings_player2_id_fkey(full_name)
            `)
            .order('round', { ascending: true })
            .order('team_code', { ascending: true })
            .order('pair_order', { ascending: true });

        setPairings(data || []);
    }

    async function loadStats() {
        const { data: players } = await supabase
            .from('tournament_players')
            .select('id');

        const { data: allMatches } = await supabase
            .from('tournament_matches')
            .select('match_status');

        const { data: submissions } = await supabase
            .from('tournament_pairings')
            .select('submission_status')
            .eq('submission_status', 'draft');

        setStats({
            totalPlayers: players?.length || 0,
            totalMatches: allMatches?.length || 0,
            completedMatches: allMatches?.filter(m => m.match_status === 'completed').length || 0,
            pendingSubmissions: submissions?.length || 0
        });
    }

    async function handleSaveSettings(e) {
        e.preventDefault();

        try {
            const res = await fetch('/api/tournament/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsForm)
            });

            const data = await res.json();
            if (data.success) {
                alert('Cài đặt đã được lưu!');
                loadSettings();
            } else {
                alert('Lỗi: ' + data.error);
            }
        } catch (err) {
            alert('Lỗi kết nối');
        }
    }

    async function handleRevealRound1() {
        if (!confirm('Bạn có chắc muốn công bố danh sách Round 1?')) return;

        try {
            const res = await fetch('/api/tournament/admin/toggle-round1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reveal: true })
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Đã công bố Round 1!');
                loadSettings();
            } else {
                alert('❌ Lỗi: ' + data.error);
            }
        } catch (err) {
            alert('❌ Lỗi kết nối');
        }
    }

    async function handleResetTournament() {
        if (!confirm('⚠️ BẠN CÓ CHẮC? Điều này sẽ XÓA TẤT CẢ dữ liệu giải đấu!')) return;
        if (!confirm('Xác nhận lần cuối: XÓA TOÀN BỘ dữ liệu giải đấu?')) return;

        // Delete all tournament data
        await supabase.from('tournament_matches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('tournament_pairings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('tournament_players').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('tournament_teams').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        alert('Đã reset giải đấu!');
        loadData();
    }

    if (loading) {
        return <div className="admin-tournament-loading">⏳ Đang tải...</div>;
    }

    return (
        <div className="admin-tournament-container">
            <div className="admin-tournament-header">
                <h1>🎾 Quản Lý Giải Đấu</h1>
                <div className="header-actions">
                    <a href="/admin/tournament/pairings" className="btn-secondary">📝 Manage Pairings</a>
                    <a href="/admin" className="btn-secondary">← Admin Dashboard</a>
                    <a href="/tournament/live" className="btn-secondary">👁️ Xem Live</a>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-value">{stats.totalPlayers}</div>
                    <div className="stat-label">Tổng người chơi</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">🎯</div>
                    <div className="stat-value">{stats.totalMatches}</div>
                    <div className="stat-label">Tổng trận đấu</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">✅</div>
                    <div className="stat-value">{stats.completedMatches}</div>
                    <div className="stat-label">Đã hoàn thành</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">⏳</div>
                    <div className="stat-value">{stats.pendingSubmissions}</div>
                    <div className="stat-label">Chờ duyệt pairing</div>
                </div>
            </div>

            {/* Tournament Settings */}
            <div className="settings-section">
                <h2>⚙️ Cài Đặt Giải Đấu</h2>
                <form onSubmit={handleSaveSettings} className="settings-form">
                    <div className="form-row">
                        <div className="form-group">
                            <label>Tên giải đấu</label>
                            <input
                                type="text"
                                value={settingsForm.tournament_name}
                                onChange={(e) => setSettingsForm({ ...settingsForm, tournament_name: e.target.value })}
                                placeholder="PICKLEBALL YEAR-END CUP"
                            />
                        </div>
                        <div className="form-group">
                            <label>Ngày tổ chức</label>
                            <input
                                type="date"
                                value={settingsForm.tournament_date}
                                onChange={(e) => setSettingsForm({ ...settingsForm, tournament_date: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Giờ bắt đầu</label>
                            <input
                                type="time"
                                value={settingsForm.start_time}
                                onChange={(e) => setSettingsForm({ ...settingsForm, start_time: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Giờ kết thúc</label>
                            <input
                                type="time"
                                value={settingsForm.end_time}
                                onChange={(e) => setSettingsForm({ ...settingsForm, end_time: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Số sân</label>
                            <input
                                type="number"
                                value={settingsForm.total_courts}
                                onChange={(e) => setSettingsForm({ ...settingsForm, total_courts: parseInt(e.target.value) })}
                                min="1"
                                max="4"
                            />
                        </div>
                        <div className="form-group">
                            <label>Thời gian mỗi trận (phút)</label>
                            <input
                                type="number"
                                value={settingsForm.match_duration_minutes}
                                onChange={(e) => setSettingsForm({ ...settingsForm, match_duration_minutes: parseInt(e.target.value) })}
                                min="10"
                                max="30"
                            />
                        </div>
                        <div className="form-group">
                            <label>Thời gian nghỉ (phút)</label>
                            <input
                                type="number"
                                value={settingsForm.break_duration_minutes}
                                onChange={(e) => setSettingsForm({ ...settingsForm, break_duration_minutes: parseInt(e.target.value) })}
                                min="0"
                                max="15"
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={settingsForm.is_active}
                                    onChange={(e) => setSettingsForm({ ...settingsForm, is_active: e.target.checked })}
                                    style={{ width: 'auto', marginRight: '8px' }}
                                />
                                Giải đấu đang hoạt động
                            </label>
                        </div>
                    </div>

                    <button type="submit" className="btn-primary">💾 Lưu Cài Đặt</button>
                </form>
            </div>

            {/* Quick Actions */}
            <div className="actions-section">
                <h2>⚡ Hành Động Nhanh</h2>
                <div className="quick-actions">
                    <button onClick={handleRevealRound1} className="btn-action btn-reveal">
                        🔓 Công Bố Round 1
                    </button>
                    <button onClick={() => router.push('/admin/tournament/pairings')} className="btn-action">
                        📋 Quản Lý Pairings
                    </button>
                    <button onClick={loadData} className="btn-action">
                        🔄 Refresh Dữ Liệu
                    </button>
                    <button onClick={handleResetTournament} className="btn-action btn-danger">
                        ⚠️ Reset Giải Đấu
                    </button>
                </div>
            </div>

            {/* Teams Overview */}
            <div className="teams-section">
                <h2>👥 Đội Thi Đấu</h2>
                <div className="teams-grid">
                    {teams.map(team => (
                        <div key={team.id} className={`team-card team-${team.team_code}`}>
                            <h3>{team.team_name}</h3>
                            <p className="team-captain">Đội trưởng: {team.captain_name || 'Chưa có'}</p>
                            <p className="team-players">{team.players?.length || 0} người chơi</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Matches Summary */}
            <div className="matches-section">
                <h2>🎯 Trận Đấu</h2>
                <div className="matches-summary">
                    {[1, 2, 3].map(round => {
                        const roundMatches = matches.filter(m => m.round === round);
                        const completed = roundMatches.filter(m => m.match_status === 'completed').length;
                        return (
                            <div key={round} className="round-summary">
                                <h3>Round {round}</h3>
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${(completed / roundMatches.length) * 100}%` }}
                                    ></div>
                                </div>
                                <p>{completed} / {roundMatches.length} trận</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
