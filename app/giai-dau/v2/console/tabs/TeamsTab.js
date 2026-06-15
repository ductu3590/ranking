'use client';

import { useState, useEffect, useCallback } from 'react';
import { listEntrants, saveEntrant, deleteEntrant } from '@/lib/tournamentV2Client';

const GENDER_LABELS = { m: 'Nam', f: 'Nữ' };

export default function TeamsTab({ tournamentId, isAdmin }) {
    const [entrants, setEntrants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [notice, setNotice] = useState('');

    // form thêm/sửa
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ name: '', seed: '' });

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const list = await listEntrants(tournamentId);
            setEntrants(Array.isArray(list) ? list : []);
        } catch (err) {
            setError(err.message || 'Không tải được danh sách đội.');
        } finally {
            setLoading(false);
        }
    }, [tournamentId]);

    useEffect(() => {
        load();
    }, [load]);

    function startEdit(en) {
        setEditId(en.id);
        setForm({ name: en.name || '', seed: en.seed != null ? String(en.seed) : '' });
        setNotice('');
    }

    function startNew() {
        setEditId('new');
        setForm({ name: '', seed: '' });
        setNotice('');
    }

    function cancel() {
        setEditId(null);
        setForm({ name: '', seed: '' });
    }

    async function submit() {
        setNotice('');
        if (!form.name.trim()) {
            setNotice('Vui lòng nhập tên đội/cặp.');
            return;
        }
        setBusyId(editId);
        try {
            const body = {
                name: form.name.trim(),
                seed: form.seed ? Number(form.seed) : undefined,
            };
            if (editId && editId !== 'new') body.id = editId;
            else body.tournament_id = tournamentId;
            await saveEntrant(body);
            cancel();
            await load();
        } catch (err) {
            setNotice(err.message || 'Không lưu được đội/cặp.');
        } finally {
            setBusyId(null);
        }
    }

    async function remove(en) {
        if (!window.confirm(`Xóa "${en.name}"? Hành động không thể hoàn tác.`)) return;
        setBusyId(en.id);
        setNotice('');
        try {
            await deleteEntrant(en.id);
            await load();
        } catch (err) {
            setNotice(err.message || 'Không xóa được đội/cặp.');
        } finally {
            setBusyId(null);
        }
    }

    if (loading) {
        return (
            <div className="v2-state v2-loading">
                <span className="v2-spinner" aria-hidden="true" />
                <p>Đang tải danh sách đội...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="v2-state v2-error">
                <p>{error}</p>
                <button type="button" className="v2-btn-secondary" onClick={load}>Thử lại</button>
            </div>
        );
    }

    return (
        <div className="v2-teams">
            {notice ? <p className="v2-notice">{notice}</p> : null}

            {entrants.length === 0 ? (
                <p className="v2-overview-sub">Chưa có đội/cặp nào.</p>
            ) : (
                <ul className="v2-item-list">
                    {entrants.map((en) => (
                        <li key={en.id} className="v2-item v2-team-item">
                            <div className="v2-team-info">
                                <span className="v2-team-name">{en.name}</span>
                                <span className="v2-item-sub">
                                    Hạt giống {en.seed ?? '—'}
                                    {Array.isArray(en.members) && en.members.length
                                        ? ` · ${en.members
                                              .map((m) => m.display_name + (GENDER_LABELS[m.gender] ? ` (${GENDER_LABELS[m.gender]})` : ''))
                                              .join(', ')}`
                                        : ''}
                                </span>
                            </div>
                            {isAdmin ? (
                                <div className="v2-team-actions">
                                    <button type="button" className="v2-link-btn" onClick={() => startEdit(en)} disabled={busyId === en.id}>
                                        Sửa
                                    </button>
                                    <button type="button" className="v2-link-btn v2-danger" onClick={() => remove(en)} disabled={busyId === en.id}>
                                        Xóa
                                    </button>
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}

            {isAdmin ? (
                editId ? (
                    <div className="v2-add-box">
                        <h3>{editId === 'new' ? 'Thêm đội/cặp' : 'Sửa đội/cặp'}</h3>
                        <div className="v2-grid-2">
                            <div className="v2-field">
                                <label>Tên</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                                    placeholder="Tuấn / Nam"
                                />
                            </div>
                            <div className="v2-field">
                                <label>Hạt giống</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={form.seed}
                                    onChange={(e) => setForm((c) => ({ ...c, seed: e.target.value }))}
                                    placeholder="(tùy chọn)"
                                />
                            </div>
                        </div>
                        <div className="v2-wizard-nav">
                            <button type="button" className="v2-btn-secondary" onClick={cancel}>Hủy</button>
                            <button type="button" className="v2-btn-primary" onClick={submit} disabled={busyId === editId}>
                                {busyId === editId ? 'Đang lưu...' : 'Lưu'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button type="button" className="v2-btn-secondary v2-block" onClick={startNew}>
                        + Thêm đội/cặp
                    </button>
                )
            ) : null}
        </div>
    );
}
