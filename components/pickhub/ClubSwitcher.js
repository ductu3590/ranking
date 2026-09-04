'use client';

import { useState } from 'react';
import { rememberClubAccessContext } from '@/lib/clubAccessClient';
import './ClubSwitcher.css';

export default function ClubSwitcher({ clubs = [], defaultClubId = null, currentSession = null }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ code: '', password: '' });
    const [status, setStatus] = useState({ kind: 'idle', message: '' });
    const currentId = currentSession?.group_id || defaultClubId;
    const currentClub = clubs.find((club) => String(club.id) === String(currentId));
    const clubName = currentSession?.group_name || currentClub?.name || 'Chọn CLB';

    function chooseClub(club) {
        setForm({ code: club.code || '', password: '' });
        setStatus({ kind: 'idle', message: '' });
        setOpen(true);
    }

    async function joinClub(event) {
        event.preventDefault();
        setStatus({ kind: 'loading', message: 'Đang xác thực CLB…' });
        try {
            const response = await fetch('/api/groups/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Không thể đổi CLB.');
            rememberClubAccessContext(payload.group);
            setStatus({ kind: 'success', message: 'Đã xác thực. Đang mở CLB…' });
            window.location.assign(payload.redirectTo || '/quy');
        } catch (error) {
            setStatus({ kind: 'error', message: error.message || 'Không thể đổi CLB.' });
        }
    }

    return (
        <div className="club-switcher">
            <button
                type="button"
                className="club-switcher-trigger"
                aria-expanded={open}
                aria-controls="club-switcher-panel"
                onClick={() => setOpen((value) => !value)}
            >
                <span className="club-switcher-mark" aria-hidden="true">P</span>
                <span><small>Không gian CLB</small><strong>{clubName}</strong></span>
                <span aria-hidden="true">⌄</span>
            </button>

            {open && (
                <section id="club-switcher-panel" className="club-switcher-panel" aria-label="Đổi CLB">
                    {clubs.length > 0 && (
                        <div className="club-switcher-list" aria-label="CLB đã dùng trên thiết bị">
                            {clubs.map((club) => {
                                const active = String(club.id) === String(currentSession?.group_id);
                                return (
                                    <button key={club.id} type="button" disabled={active} onClick={() => chooseClub(club)}>
                                        <span><strong>{club.name}</strong><small>{club.code}</small></span>
                                        <span>{active ? 'Đang mở' : 'Xác thực'}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <form onSubmit={joinClub}>
                        <p>Thêm hoặc đổi CLB</p>
                        <label>Mã CLB<input value={form.code} onChange={(event) => setForm((value) => ({ ...value, code: event.target.value.toUpperCase() }))} required /></label>
                        <label>Mật khẩu<input type="password" value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} required /></label>
                        {status.message && <p className={`club-switcher-status is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.message}</p>}
                        <button type="submit" className="club-switcher-submit" disabled={status.kind === 'loading'}>
                            {status.kind === 'loading' ? 'Đang kiểm tra…' : 'Mở CLB'}
                        </button>
                    </form>
                    <p className="club-switcher-note">CLB đã lưu chỉ giúp điền mã. Mật khẩu và phiên do máy chủ xác thực lại.</p>
                </section>
            )}
        </div>
    );
}
