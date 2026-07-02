'use client';

import { useState, useEffect, useCallback } from 'react';
import { listEntrants, saveEntrant, deleteEntrant } from '@/lib/tournamentV2Client';

export default function TeamsTab({ tournamentId, isAdmin }) {
    const [entrants, setEntrants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [notice, setNotice] = useState('');

    // form thêm/sửa
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ name: '', seed: '' });
    const [members, setMembers] = useState([]); // [{display_name, member_id}]

    // thêm thành viên thủ công
    const [manualName, setManualName] = useState('');

    // danh sách CLB
    const [clubMembers, setClubMembers] = useState([]);
    const [clubLoaded, setClubLoaded] = useState(false);

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

    useEffect(() => { load(); }, [load]);

    // Tải danh sách thành viên CLB khi mở form
    useEffect(() => {
        if (editId && !clubLoaded) {
            fetch('/api/club/members', { credentials: 'same-origin' })
                .then((r) => r.json())
                .then((d) => { setClubMembers(d.members || []); setClubLoaded(true); })
                .catch(() => setClubLoaded(true));
        }
    }, [editId, clubLoaded]);

    function startEdit(en) {
        setEditId(en.id);
        setForm({ name: en.name || '', seed: en.seed != null ? String(en.seed) : '' });
        // Khởi tạo danh sách thành viên từ entrant hiện tại
        setMembers(
            Array.isArray(en.members)
                ? en.members.map((m) => ({ display_name: m.display_name || '', member_id: m.member_id || null }))
                : []
        );
        setManualName('');
        setNotice('');
    }

    function startNew() {
        setEditId('new');
        setForm({ name: '', seed: '' });
        setMembers([]);
        setManualName('');
        setNotice('');
    }

    function cancel() {
        setEditId(null);
        setForm({ name: '', seed: '' });
        setMembers([]);
        setManualName('');
    }

    function addManual() {
        const name = manualName.trim();
        if (!name) return;
        const dup = members.some((m) => m.display_name === name && !m.member_id);
        if (dup) { setNotice('VĐV này đã có trong danh sách.'); return; }
        setMembers((c) => [...c, { display_name: name, member_id: null }]);
        setManualName('');
        setNotice('');
    }

    function toggleClubMember(cm) {
        const already = members.some((m) => m.member_id === cm.id);
        if (already) {
            setMembers((c) => c.filter((m) => m.member_id !== cm.id));
        } else {
            setMembers((c) => [...c, { display_name: cm.full_name, member_id: cm.id }]);
        }
    }

    function removeMember(idx) {
        setMembers((c) => c.filter((_, i) => i !== idx));
    }

    async function submit() {
        setNotice('');
        if (!form.name.trim()) { setNotice('Vui lòng nhập tên đội/cặp.'); return; }
        setBusyId(editId);
        try {
            const body = {
                name: form.name.trim(),
                seed: form.seed ? Number(form.seed) : undefined,
                members: members.map((m) => ({
                    display_name: m.display_name,
                    member_id: m.member_id || undefined,
                })),
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
                                        ? ` · ${en.members.map((m) => m.display_name).filter(Boolean).join(', ')}`
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

                        {/* Tên + hạt giống */}
                        <div className="v2-grid-2">
                            <div className="v2-field">
                                <label>Tên đội</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                                    placeholder="Đội A"
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

                        {/* Danh sách thành viên hiện tại */}
                        <div className="v2-field">
                            <label>Thành viên ({members.length} người)</label>
                            {members.length > 0 ? (
                                <ul className="v2-member-list">
                                    {members.map((m, i) => (
                                        <li key={i} className="v2-member-row">
                                            <span className="v2-member-name">{m.display_name}</span>
                                            <button
                                                type="button"
                                                className="v2-member-remove"
                                                onClick={() => removeMember(i)}
                                                aria-label={`Xóa ${m.display_name}`}
                                            >
                                                ×
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="v2-overview-sub" style={{ margin: '4px 0' }}>Chưa có thành viên.</p>
                            )}
                        </div>

                        {/* Thêm thủ công */}
                        <div className="v2-field">
                            <label>Thêm thành viên thủ công</label>
                            <div className="v2-member-add-row">
                                <input
                                    value={manualName}
                                    onChange={(e) => setManualName(e.target.value)}
                                    placeholder="Nhập tên VĐV..."
                                    onKeyDown={(e) => e.key === 'Enter' && addManual()}
                                />
                                <button type="button" className="v2-btn-secondary v2-btn-sm" onClick={addManual}>
                                    + Thêm
                                </button>
                            </div>
                        </div>

                        {/* Chọn từ CLB */}
                        {clubLoaded && clubMembers.length > 0 ? (
                            <div className="v2-field">
                                <label>Chọn từ thành viên CLB</label>
                                <div className="v2-member-checklist">
                                    {clubMembers.map((cm) => {
                                        const selected = members.some((m) => m.member_id === cm.id);
                                        return (
                                            <label
                                                key={cm.id}
                                                className={`v2-member-check-item ${selected ? 'selected' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleClubMember(cm)}
                                                />
                                                {cm.full_name}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

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
