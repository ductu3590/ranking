'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { listTournaments, updateTournament, deleteTournament } from '@/lib/tournamentV2Client';
import TournamentConsoleV2 from './console/TournamentConsoleV2';
import TournamentWizard from './TournamentWizard';
import './v2.css';

const STATUS_LABELS = {
    draft: 'Nháp',
    active: 'Đang diễn ra',
    completed: 'Hoàn thành',
};

const STATUS_OPTIONS = [
    { value: 'draft', label: 'Nháp' },
    { value: 'active', label: 'Đang diễn ra' },
    { value: 'completed', label: 'Hoàn thành' },
];

const ENTRANT_TYPE_LABELS = {
    pair: 'Cặp đôi',
    single: 'Đơn',
    team: 'Đội',
};

function formatDate(d) {
    if (!d) return '—';
    return d;
}

/* ==================== EDIT FORM ==================== */

function EditTournamentForm({ tournament, onSave, onCancel }) {
    const [form, setForm] = useState({
        name: tournament.name || '',
        event_date: tournament.event_date || '',
        location: tournament.location || '',
        status: tournament.status || 'draft',
    });
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    const setField = (k, v) => setForm(c => ({ ...c, [k]: v }));

    async function submit() {
        setNotice('');
        if (!form.name.trim()) { setNotice('Vui lòng nhập tên giải.'); return; }
        setBusy(true);
        try {
            await updateTournament({ id: tournament.id, ...form, name: form.name.trim() });
            onSave();
        } catch (err) {
            setNotice(err.message || 'Không lưu được.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="v2-wizard">
            <h2 className="v2-wizard-title">Sửa giải đấu</h2>

            {notice ? <p className="v2-notice">{notice}</p> : null}

            <div className="v2-field">
                <label>Tên giải</label>
                <input
                    value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    placeholder="Giải CLB mùa hè 2026"
                />
            </div>
            <div className="v2-grid-2">
                <div className="v2-field">
                    <label>Ngày thi đấu</label>
                    <input
                        type="date"
                        value={form.event_date}
                        onChange={e => setField('event_date', e.target.value)}
                    />
                </div>
                <div className="v2-field">
                    <label>Địa điểm</label>
                    <input
                        value={form.location}
                        onChange={e => setField('location', e.target.value)}
                        placeholder="Sân 246"
                    />
                </div>
            </div>
            <div className="v2-field">
                <label>Trạng thái</label>
                <select value={form.status} onChange={e => setField('status', e.target.value)}>
                    {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </div>

            <div className="v2-wizard-nav">
                <button type="button" className="v2-btn-secondary" onClick={onCancel} disabled={busy}>
                    Huỷ
                </button>
                <button type="button" className="v2-btn-primary" onClick={submit} disabled={busy}>
                    {busy ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
            </div>
        </div>
    );
}

/* ==================== MAIN PAGE ==================== */

function TournamentV2PageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const activeId = searchParams.get('t');

    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(null);      // tournament object
    const [deletingId, setDeletingId] = useState(null); // id to delete
    const [deleteBusy, setDeleteBusy] = useState(false);

    async function load() {
        setLoading(true);
        setError('');
        try {
            const list = await listTournaments();
            setTournaments(Array.isArray(list) ? list : []);
        } catch (err) {
            setError(err.message || 'Không tải được danh sách giải đấu.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetch('/api/groups/session', { credentials: 'same-origin', cache: 'no-store' })
            .then((response) => response.json())
            .then((sessionView) => {
                setIsAdmin(sessionView?.session?.role === 'admin');
            })
            .catch(() => setIsAdmin(false));
        load();
    }, []);

    function openTournament(id) {
        router.push(`/giai-dau/v2?t=${id}`);
    }

    function backToList() {
        router.push('/giai-dau/v2');
    }

    function handleWizardDone(id) {
        setCreating(false);
        load();
        if (id) openTournament(id);
    }

    function handleEditDone() {
        setEditing(null);
        load();
    }

    async function handleDelete() {
        if (!deletingId) return;
        setDeleteBusy(true);
        try {
            await deleteTournament(deletingId);
        } catch (_) { /* ignore, reload will reflect truth */ }
        finally {
            setDeleteBusy(false);
            setDeletingId(null);
            load();
        }
    }

    /* --- Console view --- */
    if (activeId) {
        return (
            <div className="v2-page">
                <button type="button" className="v2-back" onClick={backToList}>
                    ‹ Danh sách giải
                </button>
                <TournamentConsoleV2 tournamentId={activeId} />
            </div>
        );
    }

    /* --- Edit view --- */
    if (editing) {
        return (
            <div className="v2-page">
                <button type="button" className="v2-back" onClick={() => setEditing(null)}>
                    ‹ Danh sách giải
                </button>
                <EditTournamentForm
                    tournament={editing}
                    onSave={handleEditDone}
                    onCancel={() => setEditing(null)}
                />
            </div>
        );
    }

    /* --- Wizard tạo giải --- */
    if (creating) {
        return (
            <div className="v2-page">
                <button type="button" className="v2-back" onClick={() => setCreating(false)}>
                    ‹ Hủy tạo giải
                </button>
                <TournamentWizard onDone={handleWizardDone} />
            </div>
        );
    }

    /* --- Danh sách giải --- */
    const deletingTournament = deletingId ? tournaments.find(t => t.id === deletingId) : null;

    return (
        <div className="v2-page">
            {/* Delete confirmation overlay */}
            {deletingId && (
                <div className="v2-overlay" onClick={() => !deleteBusy && setDeletingId(null)}>
                    <div className="v2-dialog" onClick={e => e.stopPropagation()}>
                        <p className="v2-dialog-title">Xoá giải đấu?</p>
                        <p className="v2-dialog-body">
                            <strong>{deletingTournament?.name}</strong> sẽ bị xoá vĩnh viễn cùng toàn bộ lịch thi đấu và kết quả.
                        </p>
                        <div className="v2-dialog-actions">
                            <button
                                type="button"
                                className="v2-btn-secondary"
                                onClick={() => setDeletingId(null)}
                                disabled={deleteBusy}
                            >
                                Huỷ
                            </button>
                            <button
                                type="button"
                                className="v2-btn-danger"
                                onClick={handleDelete}
                                disabled={deleteBusy}
                            >
                                {deleteBusy ? 'Đang xoá...' : 'Xoá'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <header className="v2-list-header">
                <h1>Giải đấu</h1>
                {isAdmin && (
                    <button type="button" className="v2-btn-primary" onClick={() => setCreating(true)}>
                        + Tạo giải
                    </button>
                )}
            </header>

            {loading ? (
                <div className="v2-state v2-loading">
                    <span className="v2-spinner" aria-hidden="true" />
                    <p>Đang tải danh sách giải...</p>
                </div>
            ) : error ? (
                <div className="v2-state v2-error">
                    <p>{error}</p>
                    <button type="button" className="v2-btn-secondary" onClick={load}>
                        Thử lại
                    </button>
                </div>
            ) : tournaments.length === 0 ? (
                <div className="v2-state v2-empty">
                    <p>Chưa có giải đấu nào.</p>
                    {isAdmin && (
                        <button type="button" className="v2-btn-primary" onClick={() => setCreating(true)}>
                            + Tạo giải đầu tiên
                        </button>
                    )}
                </div>
            ) : (
                <ul className="v2-card-list">
                    {tournaments.map((t) => (
                        <li key={t.id} className="v2-card-wrap">
                            <button
                                type="button"
                                className="v2-card"
                                onClick={() => openTournament(t.id)}
                            >
                                <div className="v2-card-top">
                                    <span className={`v2-chip v2-chip-${t.status || 'draft'}`}>
                                        {STATUS_LABELS[t.status] || 'Nháp'}
                                    </span>
                                    <span className="v2-card-date">{formatDate(t.event_date)}</span>
                                </div>
                                <h2 className="v2-card-name">{t.name}</h2>
                                <p className="v2-card-meta">
                                    {ENTRANT_TYPE_LABELS[t.entrant_type] || 'Cặp đôi'}
                                    {t.location ? ` · ${t.location}` : ''}
                                </p>
                                <span className="v2-card-chevron" aria-hidden="true">›</span>
                            </button>
                            {isAdmin && (
                                <div className="v2-card-actions">
                                    <button
                                        type="button"
                                        className="v2-card-action-btn"
                                        onClick={() => setEditing(t)}
                                    >
                                        ✏️ Sửa
                                    </button>
                                    <button
                                        type="button"
                                        className="v2-card-action-btn v2-card-action-delete"
                                        onClick={() => setDeletingId(t.id)}
                                    >
                                        🗑 Xoá
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function TournamentV2Page() {
    return (
        <Suspense fallback={
            <div className="v2-page">
                <div className="v2-state v2-loading">
                    <span className="v2-spinner" aria-hidden="true" />
                    <p>Đang tải...</p>
                </div>
            </div>
        }>
            <TournamentV2PageInner />
        </Suspense>
    );
}
