'use client';

import { useState, useEffect } from 'react';

const DEFAULTS = {
    round1_reveal_time: '', start_time: '', end_time: '',
    total_courts: 2, match_duration_minutes: 15, break_duration_minutes: 5,
};

export default function SettingsTab({ tournament, fetchJson }) {
    const id = tournament.id;
    const [form, setForm] = useState(DEFAULTS);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const set = (k, v) => setForm((c) => ({ ...c, [k]: v }));

    useEffect(() => {
        let active = true;
        (async () => {
            const { res, data } = await fetchJson(`/api/tournament/admin/settings?tournamentId=${id}`);
            if (active && res.ok) setForm({ ...DEFAULTS, ...(data.settings || {}) });
        })();
        return () => { active = false; };
    }, [fetchJson, id]);

    async function handleSave(e) {
        e.preventDefault();
        setSaving(true);
        const { res, data } = await fetchJson('/api/tournament/admin/settings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tournamentId: id,
                ...form,
                total_courts: Number(form.total_courts) || 0,
                match_duration_minutes: Number(form.match_duration_minutes) || 0,
                break_duration_minutes: Number(form.break_duration_minutes) || 0,
            }),
        });
        setSaving(false);
        setNotice(res.ok ? 'Đã lưu cài đặt.' : (data.error || 'Lỗi lưu cài đặt.'));
    }

    return (
        <form className="settings-form" onSubmit={handleSave}>
            {notice ? <p className="tournament-notice">{notice}</p> : null}
            <div className="form-row">
                <div className="form-group">
                    <label>Giờ công bố Round 1</label>
                    <input type="datetime-local" value={form.round1_reveal_time || ''}
                        onChange={(e) => set('round1_reveal_time', e.target.value)} />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Giờ bắt đầu</label>
                    <input type="time" value={form.start_time || ''} onChange={(e) => set('start_time', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Giờ kết thúc</label>
                    <input type="time" value={form.end_time || ''} onChange={(e) => set('end_time', e.target.value)} />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Số sân</label>
                    <input type="number" min="1" max="8" value={form.total_courts}
                        onChange={(e) => set('total_courts', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Thời gian mỗi trận (phút)</label>
                    <input type="number" min="5" max="60" value={form.match_duration_minutes}
                        onChange={(e) => set('match_duration_minutes', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Thời gian nghỉ (phút)</label>
                    <input type="number" min="0" max="30" value={form.break_duration_minutes}
                        onChange={(e) => set('break_duration_minutes', e.target.value)} />
                </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : '💾 Lưu cài đặt'}
            </button>
        </form>
    );
}
