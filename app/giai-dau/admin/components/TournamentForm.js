'use client';

import { useState } from 'react';

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

function fromRecord(t) {
    return {
        name: t?.name || '', description: t?.description || '', event_date: t?.event_date || '',
        location: t?.location || '', status: t?.status || 'draft',
        tournament_format: t?.tournament_format || 'mlp_team', assignment_mode: t?.assignment_mode || 'random',
        team_size: t?.team_size || 4, teams_per_match: t?.teams_per_match || 2,
    };
}

export default function TournamentForm({ fetchJson, editing, onDone, onCancel }) {
    const [form, setForm] = useState(fromRecord(editing));
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const set = (k, v) => setForm((c) => ({ ...c, [k]: v }));

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.name.trim()) { setNotice('Vui lòng nhập tên giải đấu.'); return; }
        setSaving(true);
        const payload = {
            ...form, id: editing?.id,
            team_size: Number(form.team_size) || 4,
            teams_per_match: Number(form.teams_per_match) || 2,
            scoring_config: { winScore: 21, dreamBreaker: form.tournament_format === 'mlp_team' },
        };
        const { res, data } = await fetchJson('/api/tournaments', {
            method: editing ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        setSaving(false);
        if (!res.ok) { setNotice(data.error || 'Không lưu được giải đấu.'); return; }
        onDone();
    }

    return (
        <form className="tournament-editor" onSubmit={handleSubmit}>
            <div className="section-title-row">
                <h2>{editing ? 'Sửa giải đấu' : 'Tạo giải đấu'}</h2>
            </div>
            {notice ? <p className="tournament-notice">{notice}</p> : null}

            <div className="form-row">
                <div className="form-group">
                    <label>Tên giải đấu</label>
                    <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="HANA MLP Cup 2026" />
                </div>
                <div className="form-group">
                    <label>Ngày thi đấu</label>
                    <input type="date" value={form.event_date || ''} onChange={(e) => set('event_date', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Trạng thái</label>
                    <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                        <option value="draft">Nháp</option>
                        <option value="active">Đang diễn ra</option>
                        <option value="completed">Hoàn thành</option>
                    </select>
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label>Địa điểm</label>
                    <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="CLB Pickleball 246" />
                </div>
                <div className="form-group">
                    <label>Số VĐV mỗi team/cặp</label>
                    <input type="number" min="2" max="12" value={form.team_size} onChange={(e) => set('team_size', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Số team đối đầu</label>
                    <input type="number" min="2" max="8" value={form.teams_per_match} onChange={(e) => set('teams_per_match', e.target.value)} />
                </div>
            </div>

            <div className="form-group">
                <label>Mô tả</label>
                <input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Mô tả ngắn về giải đấu" />
            </div>

            <div className="format-grid">
                {TOURNAMENT_FORMAT_OPTIONS.map((fmt) => (
                    <button key={fmt.value} type="button"
                        className={form.tournament_format === fmt.value ? 'format-card active' : 'format-card'}
                        onClick={() => set('tournament_format', fmt.value)}>
                        <strong>{fmt.label}</strong>
                        <span>{fmt.description}</span>
                    </button>
                ))}
            </div>

            <div className="assignment-modes">
                {ASSIGNMENT_MODE_OPTIONS.map((mode) => (
                    <label key={mode.value} className="assignment-mode">
                        <input type="radio" name="assignment_mode" value={mode.value}
                            checked={form.assignment_mode === mode.value}
                            onChange={(e) => set('assignment_mode', e.target.value)} />
                        {mode.label}
                    </label>
                ))}
            </div>

            <div className="editor-actions">
                <button type="button" className="btn-secondary" onClick={onCancel}>Hủy</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Đang lưu...' : 'Lưu giải đấu'}
                </button>
            </div>
        </form>
    );
}
