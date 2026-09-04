'use client';
import { useEffect, useMemo, useState } from 'react';
import fundDashboardUtils from '@/lib/fundDashboard';
import './page.css';

const { buildFundEventPanel } = fundDashboardUtils;

export default function HomePage() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [accessState, setAccessState] = useState({ kind: 'loading', message: 'Đang xác thực phiên CLB…' });

    // Transactions state
    const [transactions, setTransactions] = useState([]);
    const [loadingTx, setLoadingTx] = useState(true);
    const [txError, setTxError] = useState('');
    const [filterDirection, setFilterDirection] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [txPage, setTxPage] = useState(1);
    const txPerPage = 15;

    // Fund Events state
    const [events, setEvents] = useState([]);
    const [members, setMembers] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(true);
    const [eventsError, setEventsError] = useState('');
    const [expandedEvent, setExpandedEvent] = useState(null);
    const [showMoreEvents, setShowMoreEvents] = useState(false);

    // Create Event modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState({
        title: '',
        description: '',
        amount_per_person: '',
        event_date: new Date().toISOString().split('T')[0],
        selectedMembers: []
    });
    const [savingEvent, setSavingEvent] = useState(false);

    // Delete event
    const [deletingEvent, setDeletingEvent] = useState(null);

    // Share event
    const [copiedEventId, setCopiedEventId] = useState(null);

    useEffect(() => {
        let active = true;
        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                if (!active) return;
                if (!payload.permissions?.canViewClub) {
                    setAccessState({ kind: 'forbidden', message: 'Phiên CLB không hợp lệ hoặc đã hết hạn.' });
                    setLoadingTx(false);
                    setLoadingEvents(false);
                    return;
                }
                setIsAdmin(payload.permissions?.canManageFund === true);
                setAccessState({ kind: 'ready', message: '' });
                loadTransactions();
                loadEvents();
                loadMembers();
            })
            .catch(() => {
                if (active) {
                    setAccessState({ kind: 'error', message: 'Không thể kiểm tra phiên CLB.' });
                    setLoadingTx(false);
                    setLoadingEvents(false);
                }
            });
        return () => { active = false; };
    }, []);

    // ─── Transactions ────────────────────────────────────────────

    async function loadTransactions() {
        setLoadingTx(true);
        setTxError('');
        try {
            const res = await fetch('/api/club/transactions');
            if (!res.ok) throw new Error('Máy chủ không phản hồi dữ liệu giao dịch.');
            const data = await res.json();
            setTransactions(data.transactions || []);
        } catch (error) {
            console.error('Không thể tải giao dịch:', error);
            setTxError('Không thể tải lịch sử giao dịch. Vui lòng thử lại.');
            setTransactions([]);
        } finally {
            setLoadingTx(false);
        }
    }

    const filteredTx = transactions.filter(t => {
        if (filterDirection !== 'all' && t.huong_giao_dich !== filterDirection) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (t.noi_dung_goc || '').toLowerCase().includes(q)
                || (t.nguoi_nop || '').toLowerCase().includes(q)
                || (t.ma_giao_dich || '').toLowerCase().includes(q);
        }
        return true;
    });

    const paginatedTx = filteredTx.slice((txPage - 1) * txPerPage, txPage * txPerPage);
    const totalTxPages = Math.ceil(filteredTx.length / txPerPage);

    const stats = {
        totalIn: transactions.filter(t => t.huong_giao_dich === 'in').reduce((s, t) => s + (t.so_tien || 0), 0),
        totalOut: transactions.filter(t => t.huong_giao_dich === 'out').reduce((s, t) => s + Math.abs(t.so_tien || 0), 0),
    };
    stats.balance = stats.totalIn - stats.totalOut;

    const {
        featuredEvent,
        otherActiveEvents,
        archivedEvents,
        secondaryEvents,
        visibleEvents,
        showPanel: showEventPanel,
    } = useMemo(
        () => buildFundEventPanel(events, showMoreEvents),
        [events, showMoreEvents]
    );

    // ─── Fund Events ─────────────────────────────────────────────

    async function loadEvents() {
        setLoadingEvents(true);
        setEventsError('');
        try {
            const res = await fetch('/api/club/events');
            if (!res.ok) throw new Error('Máy chủ không phản hồi dữ liệu sự kiện.');
            const data = await res.json();
            setEvents(data.events || []);
        } catch (error) {
            console.error('Không thể tải sự kiện:', error);
            setEventsError('Không thể tải sự kiện. Vui lòng thử lại.');
            setEvents([]);
        } finally {
            setLoadingEvents(false);
        }
    }

    async function loadMembers() {
        const res = await fetch('/api/club/members');
        const data = await res.json();
        setMembers(res.ok ? (data.members || []).filter((m) => m.is_active) : []);
    }

    async function handleCreateEvent(e) {
        e.preventDefault();
        if (!createForm.title.trim()) return;
        if (createForm.selectedMembers.length === 0) {
            alert('Vui lòng chọn ít nhất 1 thành viên tham gia đóng quỹ!');
            return;
        }
        setSavingEvent(true);
        try {
            const res = await fetch('/api/club/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: createForm.title.trim(),
                    description: createForm.description.trim() || null,
                    amount_per_person: createForm.amount_per_person,
                    event_date: createForm.event_date || null,
                    memberIds: createForm.selectedMembers,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Không thể tạo sự kiện');
            }
            setCreateForm({
                title: '',
                description: '',
                amount_per_person: '',
                event_date: new Date().toISOString().split('T')[0],
                selectedMembers: []
            });
            setShowCreateModal(false);
            await loadEvents();
        } catch (err) {
            alert('Lỗi khi tạo sự kiện: ' + err.message);
        } finally {
            setSavingEvent(false);
        }
    }

    async function togglePayment(participantId, currentStatus, eventId) {
        const res = await fetch('/api/club/participants', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantId, hasPaid: !currentStatus }),
        });
        if (res.ok) {
            setEvents(prev => prev.map(ev => {
                if (ev.id !== eventId) return ev;
                return {
                    ...ev,
                    fund_event_participants: ev.fund_event_participants.map(p =>
                        p.id === participantId
                            ? { ...p, has_paid: !currentStatus, paid_at: !currentStatus ? new Date().toISOString() : null }
                            : p
                    )
                };
            }));
        }
    }

    async function handleDeleteEvent(eventId) {
        if (!confirm('Xóa sự kiện này? Thao tác không thể hoàn tác.')) return;
        setDeletingEvent(eventId);
        const res = await fetch(`/api/club/events?id=${eventId}`, { method: 'DELETE' });
        if (res.ok) {
            setEvents(prev => prev.filter(ev => ev.id !== eventId));
            if (expandedEvent === eventId) setExpandedEvent(null);
        }
        setDeletingEvent(null);
    }

    async function handleShareEvent(e, eventId) {
        e.stopPropagation();
        const url = `${window.location.origin}/quy/su-kien/${eventId}`;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopiedEventId(eventId);
        setTimeout(() => setCopiedEventId(null), 2000);
    }

    function toggleMemberInForm(memberId) {
        setCreateForm(prev => ({
            ...prev,
            selectedMembers: prev.selectedMembers.includes(memberId)
                ? prev.selectedMembers.filter(id => id !== memberId)
                : [...prev.selectedMembers, memberId]
        }));
    }

    function selectAllMembers() {
        setCreateForm(prev => ({
            ...prev,
            selectedMembers: members.map(m => m.id)
        }));
    }

    function clearMemberSelection() {
        setCreateForm(prev => ({ ...prev, selectedMembers: [] }));
    }

    // ─── Render ──────────────────────────────────────────────────

    const formatMoney = (amount) => new Intl.NumberFormat('vi-VN').format(amount) + 'đ';

    if (accessState.kind !== 'ready') {
        return (
            <main className="home-dark">
                <section className={`fund-access-state is-${accessState.kind}`} role={accessState.kind === 'loading' ? 'status' : 'alert'}>
                    <span aria-hidden="true">{accessState.kind === 'loading' ? '◌' : '!'}</span>
                    <h1>{accessState.kind === 'loading' ? 'Đang mở quỹ CLB' : accessState.kind === 'forbidden' ? 'Không có quyền truy cập' : 'Chưa mở được quỹ'}</h1>
                    <p>{accessState.message}</p>
                    {accessState.kind === 'forbidden' && <a href="/">Nhập lại Mã CLB + mật khẩu</a>}
                    {accessState.kind === 'error' && <button type="button" onClick={() => window.location.reload()}>Thử lại</button>}
                </section>
            </main>
        );
    }

    return (
        <div className="home-dark">
            <div className="home-main">

                <header className="dashboard-header">
                    <div>
                        <span className="section-eyebrow">TỔNG QUAN QUỸ</span>
                        <h1>Dòng tiền minh bạch, dễ theo dõi</h1>
                        <p>Giao dịch mới nhất được hiển thị ngay trên màn hình chính.</p>
                    </div>
                    <div className="dashboard-actions">
                        {!featuredEvent && archivedEvents.length > 0 && (
                            <button
                                type="button"
                                className="btn-event-history"
                                aria-expanded={showMoreEvents}
                                aria-controls="fund-event-panel"
                                onClick={() => setShowMoreEvents((current) => !current)}
                            >
                                {showMoreEvents
                                    ? 'Ẩn sự kiện cũ'
                                    : `Sự kiện đã qua (${archivedEvents.length})`}
                            </button>
                        )}
                        {isAdmin && (
                            <button className="btn-create" onClick={() => setShowCreateModal(true)}>
                                + Tạo sự kiện
                            </button>
                        )}
                    </div>
                </header>

                {/* Stats */}
                <div className="stats-grid">
                    <div className="stat-card balance-card">
                        <div className="stat-icon">💰</div>
                        <div className="stat-info">
                            <div className="stat-label">Số dư quỹ</div>
                            <div className={`stat-value ${stats.balance >= 0 ? 'positive' : 'negative'}`}>
                                {txError ? '—' : formatMoney(stats.balance)}
                            </div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon in-icon">⬇️</div>
                        <div className="stat-info">
                            <div className="stat-label">Tổng thu</div>
                            <div className="stat-value positive">{txError ? '—' : formatMoney(stats.totalIn)}</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon out-icon">⬆️</div>
                        <div className="stat-info">
                            <div className="stat-label">Tổng chi</div>
                            <div className="stat-value negative">{txError ? '—' : formatMoney(stats.totalOut)}</div>
                        </div>
                    </div>
                </div>

                <div className={`fund-dashboard-grid ${(loadingEvents || showEventPanel || eventsError) ? 'has-event' : ''}`}>

                {/* ── Sự kiện cần theo dõi ── */}
                {(loadingEvents || showEventPanel || eventsError) && (
                    <aside className="tab-content fund-event-panel" id="fund-event-panel">
                        <div className="section-heading compact">
                            <div>
                                <span className="section-eyebrow">
                                    {eventsError ? 'KHÔNG KẾT NỐI ĐƯỢC' : featuredEvent ? 'CẦN THEO DÕI' : 'LỊCH SỬ'}
                                </span>
                                <h2>{eventsError ? 'Không thể tải sự kiện' : featuredEvent ? 'Sự kiện đang thu' : 'Sự kiện đã qua'}</h2>
                            </div>
                            {!loadingEvents && !eventsError && (
                                <span className="event-active-count">
                                    {featuredEvent
                                        ? `${1 + otherActiveEvents.length} hoạt động`
                                        : `${archivedEvents.length} đã qua`}
                                </span>
                            )}
                        </div>

                        {loadingEvents ? (
                            <div className="loading-state">⏳ Đang tải sự kiện...</div>
                        ) : eventsError ? (
                            <div className="data-error-state">
                                <p>{eventsError}</p>
                                <button type="button" className="btn-retry" onClick={loadEvents}>Thử lại</button>
                            </div>
                        ) : (
                            <div className="events-list">
                                {visibleEvents.map((event, eventIndex) => {
                                    const participants = event.fund_event_participants || [];
                                    const paidCount = participants.filter(p => p.has_paid).length;
                                    const total = participants.length;
                                    const pct = total > 0 ? Math.round((paidCount / total) * 100) : 0;
                                    const isExpanded = expandedEvent === event.id;

                                    return (
                                        <div key={event.id} className={`event-card ${eventIndex === 0 ? 'featured-event' : ''}`}>
                                            {/* Event header */}
                                            <div className="event-header">
                                                <div className="event-meta">
                                                    <h3 className="event-title">{event.title}</h3>
                                                    <div className="event-details">
                                                        {event.event_date && (
                                                            <span className="event-date">
                                                                📅 {new Date(event.event_date).toLocaleDateString('vi-VN')}
                                                            </span>
                                                        )}
                                                        {event.amount_per_person > 0 && (
                                                            <span className="event-amount">
                                                                💵 {formatMoney(event.amount_per_person)}/người
                                                            </span>
                                                        )}
                                                        {event.description && (
                                                            <span className="event-desc">{event.description}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="event-progress-wrap">
                                                    <div className="event-progress-top">
                                                        <div className="event-count">
                                                            <span className="paid-count">{paidCount}</span>
                                                            <span className="total-count">/{total}</span>
                                                            <span className="paid-label"> đã đóng</span>
                                                        </div>
                                                        <div className="progress-pct">{pct}%</div>
                                                    </div>
                                                    <div className="progress-bar-bg">
                                                        <div
                                                            className="progress-bar-fill"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <div className="event-inline-actions">
                                                        <button
                                                            type="button"
                                                            className="expand-action"
                                                            aria-expanded={isExpanded}
                                                            aria-controls={`event-body-${event.id}`}
                                                            onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                                                        >
                                                            {isExpanded ? 'Thu gọn ▲' : 'Chi tiết ▼'}
                                                        </button>
                                                        <button
                                                            className={`btn-share-event ${copiedEventId === event.id ? 'copied' : ''}`}
                                                            onClick={(e) => handleShareEvent(e, event.id)}
                                                            title="Chia sẻ link sự kiện"
                                                        >
                                                            {copiedEventId === event.id ? 'Đã sao chép' : 'Chia sẻ'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Member list (expanded) */}
                                            {isExpanded && (
                                                <div className="event-body" id={`event-body-${event.id}`}>
                                                    {isAdmin && (
                                                        <div className="event-actions">
                                                            <button
                                                                className="btn-danger-sm"
                                                                onClick={() => handleDeleteEvent(event.id)}
                                                                disabled={deletingEvent === event.id}
                                                            >
                                                                {deletingEvent === event.id ? '...' : '🗑 Xóa sự kiện'}
                                                            </button>
                                                        </div>
                                                    )}

                                                    <div className="members-grid">
                                                        {/* Chưa đóng */}
                                                        <div className="members-column">
                                                            <div className="column-header unpaid-header">
                                                                ❌ Chưa đóng ({participants.filter(p => !p.has_paid).length})
                                                            </div>
                                                            {participants
                                                                .filter(p => !p.has_paid)
                                                                .map(p => (
                                                                    <div key={p.id} className="member-row unpaid">
                                                                        <span className="member-name">
                                                                            {p.club_members?.full_name || 'N/A'}
                                                                        </span>
                                                                        {isAdmin && (
                                                                            <button
                                                                                className="btn-toggle unpaid-toggle"
                                                                                onClick={() => togglePayment(p.id, p.has_paid, event.id)}
                                                                                title="Đánh dấu đã đóng"
                                                                            >
                                                                                ✓ Đánh dấu đã đóng
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))
                                                            }
                                                            {participants.filter(p => !p.has_paid).length === 0 && (
                                                                <div className="all-paid-msg">✅ Tất cả đã đóng!</div>
                                                            )}
                                                        </div>

                                                        {/* Đã đóng */}
                                                        <div className="members-column">
                                                            <div className="column-header paid-header">
                                                                ✅ Đã đóng ({participants.filter(p => p.has_paid).length})
                                                            </div>
                                                            {participants
                                                                .filter(p => p.has_paid)
                                                                .map(p => (
                                                                    <div key={p.id} className="member-row paid">
                                                                        <span className="member-name">
                                                                            {p.club_members?.full_name || 'N/A'}
                                                                        </span>
                                                                        <div className="paid-info">
                                                                            {p.paid_at && (
                                                                                <span className="paid-at">
                                                                                    {new Date(p.paid_at).toLocaleDateString('vi-VN')}
                                                                                </span>
                                                                            )}
                                                                            {isAdmin && (
                                                                                <button
                                                                                    className="btn-toggle paid-toggle"
                                                                                    onClick={() => togglePayment(p.id, p.has_paid, event.id)}
                                                                                    title="Hủy đánh dấu"
                                                                                >
                                                                                    Hoàn tác
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            }
                                                            {participants.filter(p => p.has_paid).length === 0 && (
                                                                <div className="none-paid-msg">Chưa có ai đóng</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {secondaryEvents.length > 0 && (
                                    <button
                                        type="button"
                                        className="btn-more-events"
                                        onClick={() => setShowMoreEvents((current) => !current)}
                                    >
                                        {showMoreEvents
                                            ? 'Thu gọn sự kiện'
                                            : `Xem thêm ${secondaryEvents.length} sự kiện`}
                                    </button>
                                )}
                            </div>
                        )}
                    </aside>
                )}

                {/* ── Lịch sử giao dịch luôn hiển thị ── */}
                    <section className="tab-content transactions-panel" aria-labelledby="transaction-heading">
                        <div className="section-heading">
                            <div>
                                <span className="section-eyebrow">HOẠT ĐỘNG QUỸ</span>
                                <h2 id="transaction-heading">Lịch sử giao dịch</h2>
                                <p>{txError ? 'Dữ liệu giao dịch tạm thời không khả dụng' : `${transactions.length} giao dịch được ghi nhận`}</p>
                            </div>
                        </div>
                        {txError && (
                            <div className="data-error-state horizontal">
                                <p>{txError}</p>
                                <button type="button" className="btn-retry" onClick={loadTransactions}>Thử lại</button>
                            </div>
                        )}
                        {/* Filter bar */}
                        <div className="filter-bar">
                            {[
                                { key: 'all', label: `Tất cả ${txError ? '—' : transactions.length}` },
                                { key: 'in', label: `Tiền vào ${txError ? '—' : transactions.filter(t => t.huong_giao_dich === 'in').length}` },
                                { key: 'out', label: `Tiền ra ${txError ? '—' : transactions.filter(t => t.huong_giao_dich === 'out').length}` },
                            ].map(f => (
                                <button
                                    key={f.key}
                                    className={`filter-btn ${filterDirection === f.key ? 'active' : ''}`}
                                    disabled={Boolean(txError)}
                                    onClick={() => { setFilterDirection(f.key); setTxPage(1); }}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <div className="search-bar">
                            <div className="search-input-wrap">
                                <input
                                    type="text"
                                    placeholder="Tìm nội dung, người gửi, mã giao dịch..."
                                    value={searchQuery}
                                    disabled={Boolean(txError)}
                                    onChange={e => { setSearchQuery(e.target.value); setTxPage(1); }}
                                    className="search-input"
                                />
                            </div>
                            {searchQuery && (
                                <div className="search-result-count">Tìm thấy {filteredTx.length} kết quả</div>
                            )}
                        </div>

                        {/* Transactions list */}
                        {loadingTx ? (
                            <div className="loading-state">⏳ Đang tải giao dịch...</div>
                        ) : txError ? null : (
                            <>
                                <div className="tx-list">
                                    {paginatedTx.map(t => (
                                        <details key={t.id} className={`tx-item ${t.huong_giao_dich}`}>
                                            <summary className="tx-summary">
                                                <span className={`tx-direction-icon ${t.huong_giao_dich}`} aria-hidden="true">
                                                    {t.huong_giao_dich === 'in' ? '↙' : '↗'}
                                                </span>
                                                <span className="tx-primary">
                                                    <strong>{t.nguoi_nop || 'Không xác định'}</strong>
                                                    <span className="tx-description">
                                                        {t.noi_dung_goc || 'Không có nội dung'}
                                                    </span>
                                                    <span className="tx-date">
                                                        {new Date(t.created_at).toLocaleString('vi-VN')}
                                                    </span>
                                                </span>
                                                <span className={`tx-amount ${t.huong_giao_dich}`}>
                                                    {t.huong_giao_dich === 'in' ? '+' : '-'}
                                                    {formatMoney(Math.abs(Number(t.so_tien) || 0))}
                                                </span>
                                            </summary>
                                            <div className="tx-detail">
                                                <div className="tx-detail-copy">
                                                    <div>
                                                        <span className="tx-detail-label">Người giao dịch</span>
                                                        <span>{t.nguoi_nop || 'Không xác định'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="tx-detail-label">Nội dung đầy đủ</span>
                                                        <span>{t.noi_dung_goc || 'Không có nội dung'}</span>
                                                    </div>
                                                </div>
                                                <div className="tx-detail-meta">
                                                    <span className={`badge badge-${t.loai_giao_dich}`}>
                                                        {t.loai_giao_dich === 'nop_phat' ? 'Nộp phạt' :
                                                            t.loai_giao_dich === 'nop_quy' ? 'Nộp quỹ' : 'Khác'}
                                                    </span>
                                                    <span className="tx-code">Mã GD: {t.ma_giao_dich || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </details>
                                    ))}
                                    {paginatedTx.length === 0 && (
                                        <div className="empty-state">
                                            <div className="empty-icon">📭</div>
                                            <p>Không có giao dịch nào</p>
                                        </div>
                                    )}
                                </div>

                                {/* Pagination */}
                                {totalTxPages > 1 && (
                                    <div className="pagination">
                                        <button
                                            className="page-btn"
                                            onClick={() => setTxPage(p => Math.max(1, p - 1))}
                                            disabled={txPage === 1}
                                        >← Trước</button>
                                        <span className="page-info">Trang {txPage} / {totalTxPages}</span>
                                        <button
                                            className="page-btn"
                                            onClick={() => setTxPage(p => Math.min(totalTxPages, p + 1))}
                                            disabled={txPage >= totalTxPages}
                                        >Sau →</button>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </div>
            </div>

            {/* ── Modal tạo sự kiện ── */}
            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>📋 Tạo sự kiện đóng quỹ</h2>
                            <button className="modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
                        </div>

                        <form onSubmit={handleCreateEvent} className="modal-form">
                            <div className="form-group">
                                <label>Tên sự kiện <span className="required">*</span></label>
                                <input
                                    type="text"
                                    placeholder="VD: Quỹ tháng 3, Tiền đi ăn ngày 30/3..."
                                    value={createForm.title}
                                    onChange={e => setCreateForm(p => ({ ...p, title: e.target.value }))}
                                    required
                                    className="form-input"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Số tiền / người (đ)</label>
                                    <input
                                        type="number"
                                        placeholder="VD: 200000"
                                        value={createForm.amount_per_person}
                                        onChange={e => setCreateForm(p => ({ ...p, amount_per_person: e.target.value }))}
                                        min="0"
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Ngày sự kiện</label>
                                    <input
                                        type="date"
                                        value={createForm.event_date}
                                        onChange={e => setCreateForm(p => ({ ...p, event_date: e.target.value }))}
                                        className="form-input"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Ghi chú</label>
                                <input
                                    type="text"
                                    placeholder="Mô tả thêm về sự kiện..."
                                    value={createForm.description}
                                    onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                                    className="form-input"
                                />
                            </div>

                            {/* Chọn thành viên */}
                            <div className="form-group">
                                <div className="member-select-header">
                                    <label>
                                        Thành viên tham gia <span className="required">*</span>
                                        <span className="member-count-badge">
                                            {createForm.selectedMembers.length}/{members.length}
                                        </span>
                                    </label>
                                    <div className="member-select-actions">
                                        <button type="button" className="btn-select-all" onClick={selectAllMembers}>
                                            Chọn tất cả
                                        </button>
                                        <button type="button" className="btn-clear" onClick={clearMemberSelection}>
                                            Bỏ chọn
                                        </button>
                                    </div>
                                </div>

                                <div className="member-checkboxes">
                                    {members.map(m => (
                                        <label key={m.id} className={`member-checkbox ${createForm.selectedMembers.includes(m.id) ? 'checked' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={createForm.selectedMembers.includes(m.id)}
                                                onChange={() => toggleMemberInForm(m.id)}
                                            />
                                            <span className="checkbox-name">{m.full_name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn-cancel" onClick={() => setShowCreateModal(false)}>
                                    Hủy
                                </button>
                                <button type="submit" className="btn-submit" disabled={savingEvent}>
                                    {savingEvent ? '⏳ Đang lưu...' : '✅ Tạo sự kiện'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
