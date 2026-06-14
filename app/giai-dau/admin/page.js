'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentGroupClient } from '@/lib/groupClient';
import './admin-tournament.css';

const TOURNAMENT_FORMAT_OPTIONS = [
    { value: 'mlp_team', label: 'MLP Team Match', description: 'Thi đấu theo team, mặc định 2 team đối đầu.' },
    { value: 'doubles_round_robin', label: 'Đánh đôi vòng tròn', description: 'Chia cặp ngẫu nhiên và đánh round robin.' },
    { value: 'group_playoff', label: 'Vòng bảng + Playoff', description: 'Vòng bảng chọn đội/cặp vào playoff.' },
    { value: 'knockout', label: 'Loại trực tiếp', description: 'Thua bị loại, phù hợp giải nhanh.' },
];

const ASSIGNMENT_MODE_OPTIONS = [
    { value: 'random', label: 'Chia ngẫu nhiên' },
    { value: 'balanced', label: 'Chia cân bằng theo trình độ' },
    { value: 'manual', label: 'Admin tự kéo thả' },
    { value: 'strong_weak', label: 'Chia cặp ngẫu nhiên mạnh-yếu' },
];

const DEFAULT_TOURNAMENT_FORM = {
    name: '',
    description: '',
    event_date: '',
    location: '',
    status: 'draft',
    tournament_format: 'mlp_team',
    assignment_mode: 'random',
    team_size: 4,
    teams_per_match: 2,
};

async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const { timeoutMs = 10000, ...fetchOptions } = options;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        return { res, data };
    } catch (error) {
        return {
            res: { ok: false },
            data: { error: error.name === 'AbortError' ? 'Request timed out' : error.message },
        };
    } finally {
        clearTimeout(timeout);
    }
}

function getTournamentFormFromRecord(tournament) {
    return {
        name: tournament?.name || '',
        description: tournament?.description || '',
        event_date: tournament?.event_date || '',
        location: tournament?.location || '',
        status: tournament?.status || 'draft',
        tournament_format: tournament?.tournament_format || 'mlp_team',
        assignment_mode: tournament?.assignment_mode || 'random',
        team_size: tournament?.team_size || 4,
        teams_per_match: tournament?.teams_per_match || 2,
    };
}

export default function AdminTournamentPanel({ embedded = false }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [tournaments, setTournaments] = useState([]);
    const [showTournamentForm, setShowTournamentForm] = useState(false);
    const [editingTournament, setEditingTournament] = useState(null);
    const [tournamentForm, setTournamentForm] = useState(DEFAULT_TOURNAMENT_FORM);
    const [tournamentSaving, setTournamentSaving] = useState(false);
    const [tournamentNotice, setTournamentNotice] = useState('');
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
        if (!embedded) {
            router.replace('/admin?section=tournament');
            return;
        }

        checkAuth();
    }, [embedded, router]);

    function checkAuth() {
        const group = getCurrentGroupClient();
        if (group.role !== 'admin') {
            router.replace('/');
            return;
        }
        loadData();
    }

    async function loadData() {
        setLoading(true);
        try {
            await Promise.allSettled([
                loadTournaments(),
                loadSettings(),
                loadOverview()
            ]);
        } finally {
            setLoading(false);
        }
    }

    async function loadTournaments() {
        const { res, data } = await fetchJson('/api/tournaments');
        if (res.ok) {
            setTournaments(data.tournaments || []);
        }
    }

    async function loadSettings() {
        const { data } = await fetchJson('/api/tournament/admin/settings');
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

    async function loadOverview() {
        const { res, data } = await fetchJson('/api/tournament/admin/overview');
        if (res.ok) {
            setTeams(data.teams || []);
            setMatches(data.matches || []);
            setPairings(data.pairings || []);
            setStats(data.stats || { totalPlayers: 0, totalMatches: 0, completedMatches: 0, pendingSubmissions: 0 });
        }
    }

    function openCreateTournament() {
        setEditingTournament(null);
        setTournamentForm(DEFAULT_TOURNAMENT_FORM);
        setShowTournamentForm(true);
        setTournamentNotice('');
    }

    function openEditTournament(tournament) {
        setEditingTournament(tournament);
        setTournamentForm(getTournamentFormFromRecord(tournament));
        setShowTournamentForm(true);
        setTournamentNotice('');
    }

    function updateTournamentForm(field, value) {
        setTournamentForm((current) => ({
            ...current,
            [field]: value,
        }));
    }

    async function handleSaveTournament(e) {
        e.preventDefault();
        if (!tournamentForm.name.trim()) {
            setTournamentNotice('Vui lòng nhập tên giải đấu.');
            return;
        }

        setTournamentSaving(true);
        const payload = {
            ...tournamentForm,
            id: editingTournament?.id,
            team_size: Number(tournamentForm.team_size) || 4,
            teams_per_match: Number(tournamentForm.teams_per_match) || 2,
            scoring_config: {
                winScore: 21,
                dreamBreaker: tournamentForm.tournament_format === 'mlp_team',
            },
        };
        const { res, data } = await fetchJson('/api/tournaments', {
            method: editingTournament ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        setTournamentSaving(false);

        if (!res.ok) {
            setTournamentNotice(data.error || 'Không lưu được giải đấu.');
            return;
        }

        setTournamentNotice(editingTournament ? 'Đã cập nhật giải đấu.' : 'Đã tạo giải đấu.');
        setShowTournamentForm(false);
        setEditingTournament(null);
        await loadTournaments();
    }

    async function handleDeleteTournament(tournament) {
        if (!confirm(`Xóa giải "${tournament.name}"?`)) return;
        if (!confirm('Xác nhận lần cuối: toàn bộ team, VĐV, lịch và cài đặt của giải này sẽ bị xóa.')) return;

        const { res, data } = await fetchJson(`/api/tournaments?id=${tournament.id}`, { method: 'DELETE' });
        if (!res.ok) {
            setTournamentNotice(data.error || 'Không xóa được giải đấu.');
            return;
        }
        setTournamentNotice('Đã xóa giải đấu.');
        await Promise.all([loadTournaments(), loadOverview()]);
    }

    async function handleAutoAssign(tournament) {
        const { res, data } = await fetchJson('/api/tournaments/auto-assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tournamentId: tournament.id,
                format: tournament.tournament_format || 'mlp_team',
                teamSize: tournament.team_size || 4,
                teamsPerMatch: tournament.teams_per_match || 2,
            }),
        });
        if (!res.ok) {
            setTournamentNotice(data.error || 'Không chia tự động được.');
            return;
        }
        setTournamentNotice(
            (tournament.tournament_format || 'mlp_team') === 'mlp_team'
                ? 'Đã chia team ngẫu nhiên từ thành viên CLB.'
                : 'Đã chia cặp ngẫu nhiên từ thành viên CLB.'
        );
        setTeams(data.teams || []);
        await loadOverview();
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

        const res = await fetch('/api/tournament/admin/reset', { method: 'POST' });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi reset: ' + (data.error || ''));
            return;
        }
        alert('Đã reset giải đấu!');
        loadData();
    }

    if (loading) {
        return <div className="admin-tournament-loading">⏳ Đang tải...</div>;
    }

    return (
        <div className={`admin-tournament-container ${embedded ? 'embedded' : ''}`}>
            {!embedded && <div className="admin-tournament-header">
                <h1>🎾 Quản Lý Giải Đấu</h1>
                <div className="header-actions">
                    <a href="/admin?section=tournament&view=pairings" className="btn-secondary">📝 Manage Pairings</a>
                    <a href="/admin" className="btn-secondary">← Admin Dashboard</a>
                    <a href="/giai-dau/1/live" className="btn-secondary">👁️ Xem Live</a>
                </div>
            </div>}

            <div className="tournament-manager-section">
                <div className="section-title-row">
                    <div>
                        <h2>Danh sách giải đấu</h2>
                        <p>Admin CLB có thể tạo, sửa, xóa và tự động chia team/cặp cho từng giải.</p>
                    </div>
                    <button type="button" className="btn-primary" onClick={openCreateTournament}>
                        Tạo giải đấu
                    </button>
                </div>

                {tournamentNotice ? <p className="tournament-notice">{tournamentNotice}</p> : null}

                {showTournamentForm ? (
                    <form className="tournament-editor" onSubmit={handleSaveTournament}>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Tên giải đấu</label>
                                <input
                                    value={tournamentForm.name}
                                    onChange={(e) => updateTournamentForm('name', e.target.value)}
                                    placeholder="HANA MLP Cup 2026"
                                />
                            </div>
                            <div className="form-group">
                                <label>Ngày thi đấu</label>
                                <input
                                    type="date"
                                    value={tournamentForm.event_date || ''}
                                    onChange={(e) => updateTournamentForm('event_date', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Trạng thái</label>
                                <select value={tournamentForm.status} onChange={(e) => updateTournamentForm('status', e.target.value)}>
                                    <option value="draft">Nháp</option>
                                    <option value="active">Đang diễn ra</option>
                                    <option value="completed">Hoàn thành</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Địa điểm</label>
                                <input
                                    value={tournamentForm.location}
                                    onChange={(e) => updateTournamentForm('location', e.target.value)}
                                    placeholder="CLB Pickleball 246"
                                />
                            </div>
                            <div className="form-group">
                                <label>Số VĐV mỗi team/cặp</label>
                                <input
                                    type="number"
                                    min="2"
                                    max="12"
                                    value={tournamentForm.team_size}
                                    onChange={(e) => updateTournamentForm('team_size', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Số team đối đầu</label>
                                <input
                                    type="number"
                                    min="2"
                                    max="8"
                                    value={tournamentForm.teams_per_match}
                                    onChange={(e) => updateTournamentForm('teams_per_match', e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Mô tả</label>
                            <input
                                value={tournamentForm.description}
                                onChange={(e) => updateTournamentForm('description', e.target.value)}
                                placeholder="Mô tả ngắn về giải đấu"
                            />
                        </div>

                        <div className="format-grid">
                            {TOURNAMENT_FORMAT_OPTIONS.map((format) => (
                                <button
                                    key={format.value}
                                    type="button"
                                    className={tournamentForm.tournament_format === format.value ? 'format-card active' : 'format-card'}
                                    onClick={() => updateTournamentForm('tournament_format', format.value)}
                                >
                                    <strong>{format.label}</strong>
                                    <span>{format.description}</span>
                                </button>
                            ))}
                        </div>

                        <div className="assignment-modes">
                            {ASSIGNMENT_MODE_OPTIONS.map((mode) => (
                                <label key={mode.value} className="assignment-mode">
                                    <input
                                        type="radio"
                                        name="assignment_mode"
                                        value={mode.value}
                                        checked={tournamentForm.assignment_mode === mode.value}
                                        onChange={(e) => updateTournamentForm('assignment_mode', e.target.value)}
                                    />
                                    {mode.label}
                                </label>
                            ))}
                        </div>

                        <div className="editor-actions">
                            <button type="button" className="btn-secondary" onClick={() => setShowTournamentForm(false)}>
                                Hủy
                            </button>
                            <button type="submit" className="btn-primary" disabled={tournamentSaving}>
                                {tournamentSaving ? 'Đang lưu...' : 'Lưu giải đấu'}
                            </button>
                        </div>
                    </form>
                ) : null}

                <div className="tournament-list">
                    {tournaments.map((tournament) => (
                        <article key={tournament.id} className="tournament-admin-card">
                            <div>
                                <div className="card-topline">
                                    <span className={`status-pill status-${tournament.status || 'draft'}`}>
                                        {tournament.status || 'draft'}
                                    </span>
                                    <span>{tournament.event_date || 'Chưa có ngày'}</span>
                                </div>
                                <h3>{tournament.name}</h3>
                                <p>
                                    {TOURNAMENT_FORMAT_OPTIONS.find((item) => item.value === tournament.tournament_format)?.label || 'MLP Team Match'}
                                    {' '}• {tournament.team_size || 4} VĐV/team • {tournament.teams_per_match || 2} team
                                </p>
                                <small>{tournament.location || 'Chưa có địa điểm'}</small>
                            </div>
                            <div className="tournament-card-actions">
                                <button type="button" className="btn-action" onClick={() => handleAutoAssign(tournament)}>
                                    {tournament.tournament_format === 'mlp_team' ? 'Chia team ngẫu nhiên' : 'Chia cặp ngẫu nhiên'}
                                </button>
                                <button type="button" className="btn-action" onClick={() => openEditTournament(tournament)}>
                                    Sửa
                                </button>
                                <button type="button" className="btn-action btn-danger" onClick={() => handleDeleteTournament(tournament)}>
                                    Xóa
                                </button>
                            </div>
                        </article>
                    ))}
                    {tournaments.length === 0 ? <p className="empty-state">Chưa có giải đấu nào.</p> : null}
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
                    <button onClick={() => router.push('/admin?section=tournament&view=pairings')} className="btn-action">
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
                        const roundMatches = matches.filter(m => m.round_number === round);
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
