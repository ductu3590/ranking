'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { listTournaments, updateTournament, deleteTournament } from '@/lib/tournamentV2Client';
import { STATUS_LABELS, groupOf, sortForGroup } from '@/lib/tournament/lifecycle';
import TournamentWizard from './TournamentWizard';
import './v2.css';

const STATUS_OPTIONS = [
    { value: 'draft', label: STATUS_LABELS.draft },
    { value: 'registration_open', label: STATUS_LABELS.registration_open },
    { value: 'registration_closed', label: STATUS_LABELS.registration_closed },
    { value: 'scheduled', label: STATUS_LABELS.scheduled },
    { value: 'live', label: STATUS_LABELS.live },
    { value: 'completed', label: STATUS_LABELS.completed },
];

const ENTRANT_TYPE_LABELS = {
    pair: 'Cặp đôi',
    single: 'Đơn',
    team: 'Đội',
};

function formatDate(d) {
    if (!d) return '—';
    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(`${d}T00:00:00`));
}

const LIST_FILTERS = [
    { value: 'all', label: 'Tất cả' },
    { value: 'running', label: 'Đang diễn ra' },
    { value: 'upcoming', label: 'Sắp tổ chức' },
    { value: 'finished', label: 'Đã kết thúc' },
];

const ORGANIZER_MODE_LABELS = {
    internal: 'Nội bộ CLB',
    friendly: 'Giao hữu liên CLB',
    community: 'Cộng đồng',
};

const SCHEDULE_FORMAT_LABELS = {
    round_robin: 'Vòng tròn',
    knockout: 'Loại trực tiếp',
};

function formatTags(tournament) {
    const tags = (tournament.formats || []).flatMap((format) => ([
        SCHEDULE_FORMAT_LABELS[format.schedule_format],
        format.match_format === 'mlp' ? 'MLP' : null,
    ])).filter(Boolean);
    return Array.from(new Set(tags));
}

function rowPresentation(tournament) {
    const group = groupOf(tournament.status || 'draft');
    if (group === 'running') {
        return {
            tone: 'live',
            badge: 'Đang diễn ra',
            visualLabel: 'Sân chính',
            primaryAction: 'Điều hành giải đấu',
            secondaryAction: 'Nhập điểm trực tiếp',
        };
    }
    if (group === 'finished') {
        return {
            tone: 'finished',
            badge: 'Đã kết thúc',
            visualLabel: 'Hoàn tất',
            primaryAction: 'Xem biên bản & kết quả',
            secondaryAction: 'Lưu trữ giải',
        };
    }
    return {
        tone: 'upcoming',
        badge: STATUS_LABELS[tournament.status] || 'Sắp tổ chức',
        visualLabel: 'Nội bộ CLB',
        primaryAction: tournament.status === 'registration_open' ? 'Quản lý đăng ký' : 'Xếp cặp & bốc thăm',
        secondaryAction: 'Chỉnh sửa giải',
    };
}

function TournamentListRow({ tournament, isAdmin, onOpen, onEdit, onDelete }) {
    const display = rowPresentation(tournament);
    const progress = tournament.match_progress;
    const registration = tournament.registration_summary;
    const capacity = registration?.capacity;
    const approved = registration?.approved || 0;
    const participationLabel = capacity == null
        ? (registration ? `${approved} suất đã duyệt` : 'Chưa đặt quy mô')
        : `${approved} / ${capacity} suất`;
    const participationPercent = capacity > 0 ? Math.min(100, Math.round((approved / capacity) * 100)) : 0;
    const tags = formatTags(tournament);
    const progressText = progress?.total > 0
        ? `${progress.finalized}/${progress.total} trận đã chốt`
        : display.tone === 'upcoming' ? 'Đang chuẩn bị danh sách thi đấu' : 'Sẵn sàng điều hành trên sân';

    return (
        <article className={`v2-tournament-row v2-tournament-row-${display.tone}`}>
            <div className="v2-tournament-visual" aria-hidden="true">
                <span>{display.visualLabel}</span>
                <i />
            </div>
            <div className="v2-tournament-info">
                <div className="v2-tournament-badges">
                    <span className="v2-tournament-status"><i />{display.badge}</span>
                    <span className="v2-tournament-code">Mã: #{tournament.id}</span>
                </div>
                <button type="button" className="v2-tournament-title" onClick={onOpen}>
                    {tournament.name}
                </button>
                <div className="v2-tournament-meta">
                    <span>◷ {formatDate(tournament.event_date)}</span>
                    <span>⌖ {tournament.location || 'Chưa cập nhật địa điểm'}</span>
                </div>
                <div className="v2-tournament-tags" aria-label="Phạm vi và thể thức giải">
                    <span className={`v2-tournament-kind v2-tournament-kind-${tournament.organizer_mode || 'internal'}`}>
                        {ORGANIZER_MODE_LABELS[tournament.organizer_mode] || 'Nội bộ CLB'}
                    </span>
                    <span className="v2-tournament-format">{ENTRANT_TYPE_LABELS[tournament.entrant_type] || 'Cặp đôi'}</span>
                    {tags.map((tag) => <span key={tag} className="v2-tournament-format">{tag}</span>)}
                </div>
                <div className="v2-tournament-progress">
                    <div>
                        <span>Quy mô tham gia</span>
                        <strong>{participationLabel}</strong>
                    </div>
                    <div className="v2-progress-track"><i style={{ width: `${participationPercent}%` }} /></div>
                    <span className="v2-tournament-progress-note">{progressText}</span>
                </div>
            </div>
            {isAdmin && (
                <div className="v2-tournament-actions">
                    <button type="button" className="v2-tournament-primary" onClick={onOpen}>
                        {display.primaryAction} <span aria-hidden="true">›</span>
                    </button>
                    <button type="button" className="v2-tournament-secondary" onClick={display.tone === 'live' ? onOpen : onEdit}>
                        {display.secondaryAction}
                    </button>
                    {tournament.status === 'draft' && (
                        <button type="button" className="v2-tournament-delete" onClick={onDelete}>Xoá giải</button>
                    )}
                </div>
            )}
        </article>
    );
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

function TournamentV2DashboardClientInner() {
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
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

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

    useEffect(() => {
        if (activeId) router.replace(`/dieu-hanh-giai/${activeId}`);
    }, [activeId, router]);

    function openTournament(id) {
        router.push(`/dieu-hanh-giai/${id}`);
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

    /* URL cũ ?t=<id> được chuyển sang màn điều hành toàn màn hình. */
    if (activeId) {
        return (
            <div className="v2-page v2-route-redirect">
                Đang mở bàn điều hành giải đấu...
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
    const searchedTournaments = tournaments.filter((t) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (t.name || '').toLowerCase().includes(q) || (t.location || '').toLowerCase().includes(q);
    });
    const visibleTournaments = searchedTournaments.filter((t) => (
        statusFilter === 'all' || groupOf(t.status || 'draft') === statusFilter
    ));
    const summary = {
        total: tournaments.length,
        running: tournaments.filter((t) => groupOf(t.status || 'draft') === 'running').length,
        upcoming: tournaments.filter((t) => groupOf(t.status || 'draft') === 'upcoming').length,
    };
    const orderedTournaments = ['running', 'upcoming', 'finished'].flatMap((group) => (
        sortForGroup(visibleTournaments.filter((t) => groupOf(t.status || 'draft') === group), group)
    ));

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

            <section className="v2-dashboard-header">
                <div>
                    <div className="v2-page-kicker">Hoạt động & thi đấu</div>
                    <h1>Quản lý Giải đấu</h1>
                    <p>Quản trị, tổ chức và điều hành các giải đấu pickleball của câu lạc bộ.</p>
                </div>
                {isAdmin && (
                    <button type="button" className="v2-btn-primary v2-create-tournament" onClick={() => setCreating(true)}>
                        <span aria-hidden="true">＋</span> Tạo giải đấu mới
                    </button>
                )}
            </section>

            <section className="v2-stat-grid" aria-label="Tổng quan giải đấu">
                <article className="v2-stat-card v2-stat-card-total">
                    <span className="v2-stat-icon" aria-hidden="true">🏆</span>
                    <span className="v2-stat-label">Tổng giải đấu</span>
                    <strong>{summary.total}</strong>
                    <span className="v2-stat-detail">Toàn bộ giải của CLB</span>
                </article>
                <article className="v2-stat-card v2-stat-card-live">
                    <span className="v2-stat-icon" aria-hidden="true">●</span>
                    <span className="v2-stat-label">Đang diễn ra</span>
                    <strong>{summary.running}</strong>
                    <span className="v2-stat-detail">Cần theo dõi kết quả</span>
                </article>
                <article className="v2-stat-card v2-stat-card-upcoming">
                    <span className="v2-stat-icon" aria-hidden="true">▣</span>
                    <span className="v2-stat-label">Sắp tổ chức</span>
                    <strong>{summary.upcoming}</strong>
                    <span className="v2-stat-detail">Nháp, mở đăng ký hoặc chốt lịch</span>
                </article>
            </section>

            <div className="v2-toolbar">
                <label className="v2-search-wrap">
                    <span aria-hidden="true">⌕</span>
                    <input
                        className="v2-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm giải theo tên hoặc địa điểm"
                        aria-label="Tìm giải"
                    />
                </label>
                <div className="v2-status-filter" aria-label="Lọc giải đấu theo trạng thái">
                    {LIST_FILTERS.map((filter) => (
                        <button
                            type="button"
                            key={filter.value}
                            className={statusFilter === filter.value ? 'is-active' : ''}
                            onClick={() => setStatusFilter(filter.value)}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

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
            ) : orderedTournaments.length === 0 ? (
                <div className="v2-state v2-empty">
                    <p>Chưa tìm thấy giải đấu phù hợp.</p>
                    {isAdmin && (
                        <button type="button" className="v2-btn-primary" onClick={() => setCreating(true)}>
                            + Tạo giải đầu tiên
                        </button>
                    )}
                </div>
            ) : (
                <section className="v2-tournament-list" aria-label="Danh sách giải đấu">
                    {orderedTournaments.map((t) => (
                        <TournamentListRow
                            key={t.id}
                            tournament={t}
                            isAdmin={isAdmin}
                            onOpen={() => openTournament(t.id)}
                            onEdit={() => setEditing(t)}
                            onDelete={() => setDeletingId(t.id)}
                        />
                    ))}
                </section>
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
            <TournamentV2DashboardClientInner />
        </Suspense>
    );
}
