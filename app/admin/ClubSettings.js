'use client';

import { useEffect, useState } from 'react';
import './club-settings.css';

export default function ClubSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [group, setGroup] = useState(null);
    const [qr, setQr] = useState({ joinUrl: '', qrCodeDataUrl: '' });
    const [form, setForm] = useState({ name: '', description: '', memberPassword: '' });

    useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        setLoading(true);
        const res = await fetch('/api/club/settings');
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setQr({ joinUrl: data.joinUrl, qrCodeDataUrl: data.qrCodeDataUrl });
            setForm({ name: data.group.name || '', description: data.group.description || '', memberPassword: '' });
        } else {
            setError(data.error || 'Không tải được cài đặt.');
        }
        setLoading(false);
    }

    async function handleSave(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        setNotice('');
        const payload = { name: form.name, description: form.description };
        if (form.memberPassword) payload.memberPassword = form.memberPassword;
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setForm((prev) => ({ ...prev, memberPassword: '' }));
            setNotice('Đã lưu thay đổi.');
        } else {
            setError(data.error || 'Không lưu được.');
        }
        setSaving(false);
    }

    async function handleRegenerate() {
        if (!confirm('Tạo lại mã nhóm? Mã và mã QR cũ sẽ NGỪNG hoạt động. Bạn cần gửi mã mới cho thành viên.')) return;
        setSaving(true);
        setError('');
        setNotice('');
        const res = await fetch('/api/club/settings/regenerate-code', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            setGroup((prev) => ({ ...prev, code: data.code }));
            setQr({ joinUrl: data.joinUrl, qrCodeDataUrl: data.qrCodeDataUrl });
            setNotice('Đã tạo mã mới. Hãy gửi lại cho thành viên.');
        } else {
            setError(data.error || 'Không tạo lại được mã.');
        }
        setSaving(false);
    }

    if (loading) {
        return <div className="club-settings-loading">⏳ Đang tải cài đặt...</div>;
    }
    if (!group) {
        return <div className="club-settings-error">{error || 'Không có dữ liệu.'}</div>;
    }

    return (
        <div className="club-settings">
            {error && <p className="club-settings-msg error">{error}</p>}
            {notice && <p className="club-settings-msg ok">{notice}</p>}

            <form className="club-settings-form" onSubmit={handleSave}>
                <label>
                    Tên CLB
                    <input
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        required
                    />
                </label>
                <label>
                    Mô tả
                    <textarea
                        rows="3"
                        value={form.description}
                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    />
                </label>
                <label>
                    Đổi mật khẩu thành viên (để trống nếu không đổi)
                    <input
                        type="password"
                        value={form.memberPassword}
                        onChange={(e) => setForm((p) => ({ ...p, memberPassword: e.target.value }))}
                        minLength="4"
                        placeholder="••••"
                    />
                </label>
                <button type="submit" className="club-settings-save" disabled={saving}>
                    {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
            </form>

            <div className="club-settings-code">
                <p className="club-settings-code-label">Mã nhóm</p>
                <strong className="club-settings-code-value">{group.code}</strong>
                {qr.qrCodeDataUrl && (
                    <img src={qr.qrCodeDataUrl} alt={`QR tham gia ${group.code}`} />
                )}
                <button type="button" className="club-settings-regen" onClick={handleRegenerate} disabled={saving}>
                    Tạo lại mã
                </button>
            </div>
        </div>
    );
}
