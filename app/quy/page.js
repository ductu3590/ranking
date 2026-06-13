'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentGroupIdClient, isMissingGroupColumnError } from '@/lib/groupClient';
import './page.css';

export default function HomePage() {
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('events');

    // Transactions state
    const [transactions, setTransactions] = useState([]);
    const [loadingTx, setLoadingTx] = useState(true);
    const [filterDirection, setFilterDirection] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [txPage, setTxPage] = useState(1);
    const txPerPage = 15;

    // Fund Events state
    const [events, setEvents] = useState([]);
    const [members, setMembers] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(true);
    const [expandedEvent, setExpandedEvent] = useState(null);

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

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user || null);
        });
        loadTransactions();
        loadEvents();
        loadMembers();
    }, []);

    // ─── Transactions ────────────────────────────────────────────

    async function loadTransactions() {
        setLoadingTx(true);
        const groupId = getCurrentGroupIdClient();
        const { data, error } = await supabase
            .from('quy_pickleball')
            .select('*')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false });
        if (!error) {
            setTransactions(data || []);
        } else if (isMissingGroupColumnError(error)) {
            const { data: fallbackData } = await supabase
                .from('quy_pickleball')
                .select('*')
                .order('created_at', { ascending: false });
            setTransactions(fallbackData || []);
        }
        setLoadingTx(false);
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

    // ─── Fund Events ─────────────────────────────────────────────

    async function loadEvents() {
        setLoadingEvents(true);
        const groupId = getCurrentGroupIdClient();
        const { data: eventsData, error: eventsErr } = await supabase
            .from('fund_events')
            .select(`
                *,
                fund_event_participants (
                    id,
                    member_id,
                    has_paid,
                    paid_at,
                    notes,
                    club_members ( id, full_name, is_active )
                )
            `)
            .eq('group_id', groupId)
            .order('created_at', { ascending: false });

        if (!eventsErr) {
            setEvents(eventsData || []);
        } else if (isMissingGroupColumnError(eventsErr)) {
            const { data: fallbackEvents } = await supabase
                .from('fund_events')
                .select(`
                *,
                fund_event_participants (
                    id,
                    member_id,
                    has_paid,
                    paid_at,
                    notes,
                    club_members ( id, full_name, is_active )
                )
            `)
                .order('created_at', { ascending: false });
            setEvents(fallbackEvents || []);
        }
        setLoadingEvents(false);
    }

    async function loadMembers() {
        const groupId = getCurrentGroupIdClient();
        const { data, error } = await supabase
            .from('club_members')
            .select('id, full_name, is_active')
            .eq('group_id', groupId)
            .eq('is_active', true)
            .order('full_name');
        if (!error) {
            setMembers(data || []);
        } else if (isMissingGroupColumnError(error)) {
            const { data: fallbackMembers } = await supabase
                .from('club_members')
                .select('id, full_name, is_active')
                .eq('is_active', true)
                .order('full_name');
            setMembers(fallbackMembers || []);
        }
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
            const groupId = getCurrentGroupIdClient();
            // Tạo event
            const { data: eventData, error: eventErr } = await supabase
                .from('fund_events')
                .insert({
                    group_id: groupId,
                    title: createForm.title.trim(),
                    description: createForm.description.trim() || null,
                    amount_per_person: parseFloat(createForm.amount_per_person) || 0,
                    event_date: createForm.event_date || null,
                })
                .select()
                .single();

            let createdEvent = eventData;
            if (eventErr && isMissingGroupColumnError(eventErr)) {
                const { data: fallbackEventData, error: fallbackEventErr } = await supabase
                    .from('fund_events')
                    .insert({
                        title: createForm.title.trim(),
                        description: createForm.description.trim() || null,
                        amount_per_person: parseFloat(createForm.amount_per_person) || 0,
                        event_date: createForm.event_date || null,
                    })
                    .select()
                    .single();

                if (fallbackEventErr) throw fallbackEventErr;
                createdEvent = fallbackEventData;
            } else if (eventErr) {
                throw eventErr;
            }

            // Thêm participants
            const participants = createForm.selectedMembers.map(memberId => ({
                event_id: createdEvent.id,
                member_id: memberId,
                has_paid: false,
            }));

            const { error: partErr } = await supabase
                .from('fund_event_participants')
                .insert(participants);

            if (partErr) throw partErr;

            // Reset form
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
        const { error } = await supabase
            .from('fund_event_participants')
            .update({
                has_paid: !currentStatus,
                paid_at: !currentStatus ? new Date().toISOString() : null,
            })
            .eq('id', participantId);

        if (!error) {
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
        const groupId = getCurrentGroupIdClient();
        const { error } = await supabase.from('fund_events').delete().eq('id', eventId).eq('group_id', groupId);
        if (!error || isMissingGroupColumnError(error)) {
            if (isMissingGroupColumnError(error)) {
                await supabase.from('fund_events').delete().eq('id', eventId);
            }
            setEvents(prev => prev.filter(ev => ev.id !== eventId));
            if (expandedEvent === eventId) setExpandedEvent(null);
        }
        setDeletingEvent(null);
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

    return (
        <div className="home-dark">
            <div className="home-main">

                {/* Stats */}
                <div className="stats-grid">
                    <div className="stat-card balance-card">
                        <div className="stat-icon">💰</div>
                        <div className="stat-info">
                            <div className="stat-label">Số dư quỹ</div>
                            <div className={`stat-value ${stats.balance >= 0 ? 'positive' : 'negative'}`}>
                                {formatMoney(stats.balance)}
                            </div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon in-icon">⬇️</div>
                        <div className="stat-info">
                            <div className="stat-label">Tiền vào</div>
                            <div className="stat-value positive">{formatMoney(stats.totalIn)}</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon out-icon">⬆️</div>
                        <div className="stat-info">
                            <div className="stat-label">Tiền ra</div>
                            <div className="stat-value negative">{formatMoney(stats.totalOut)}</div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="tab-bar">
                    <button
                        className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
                        onClick={() => setActiveTab('events')}
                    >
                        📋 Sự kiện đóng quỹ
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('transactions')}
                    >
                        📑 Lịch sử giao dịch
                    </button>
                </div>

                {/* ── Tab: Sự kiện đóng quỹ ── */}
                {activeTab === 'events' && (
                    <div className="tab-content">
                        {/* Admin: Tạo sự kiện */}
                        {user && (
                            <div className="admin-bar">
                                <span className="admin-note">👑 Chế độ admin</span>
                                <button className="btn-create" onClick={() => setShowCreateModal(true)}>
                                    + Tạo sự kiện đóng quỹ
                                </button>
                            </div>
                        )}

                        {loadingEvents ? (
                            <div className="loading-state">⏳ Đang tải sự kiện...</div>
                        ) : events.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">📋</div>
                                <p>Chưa có sự kiện đóng quỹ nào</p>
                                {user && <p className="empty-hint">Nhấn &quot;+ Tạo sự kiện đóng quỹ&quot; để bắt đầu</p>}
                            </div>
                        ) : (
                            <div className="events-list">
                                {events.map(event => {
                                    const participants = event.fund_event_participants || [];
                                    const paidCount = participants.filter(p => p.has_paid).length;
                                    const total = participants.length;
                                    const pct = total > 0 ? Math.round((paidCount / total) * 100) : 0;
                                    const isExpanded = expandedEvent === event.id;

                                    return (
                                        <div key={event.id} className="event-card">
                                            {/* Event header */}
                                            <div
                                                className="event-header"
                                                onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                                            >
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
                                                    <div className="event-count">
                                                        <span className="paid-count">{paidCount}</span>
                                                        <span className="total-count">/{total}</span>
                                                        <span className="paid-label"> đã đóng</span>
                                                    </div>
                                                    <div className="progress-bar-bg">
                                                        <div
                                                            className="progress-bar-fill"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <div className="progress-pct">{pct}%</div>
                                                    <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                                                </div>
                                            </div>

                                            {/* Member list (expanded) */}
                                            {isExpanded && (
                                                <div className="event-body">
                                                    {user && (
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
                                                                        {user && (
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
                                                                            {user && (
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
                            </div>
                        )}
                    </div>
                )}

                {/* ── Tab: Lịch sử giao dịch ── */}
                {activeTab === 'transactions' && (
                    <div className="tab-content">
                        {/* Filter bar */}
                        <div className="filter-bar">
                            {[
                                { key: 'all', label: `📋 Tất cả (${transactions.length})` },
                                { key: 'in', label: `⬇️ Tiền vào (${transactions.filter(t => t.huong_giao_dich === 'in').length})` },
                                { key: 'out', label: `⬆️ Tiền ra (${transactions.filter(t => t.huong_giao_dich === 'out').length})` },
                            ].map(f => (
                                <button
                                    key={f.key}
                                    className={`filter-btn ${filterDirection === f.key ? 'active' : ''}`}
                                    onClick={() => { setFilterDirection(f.key); setTxPage(1); }}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <div className="search-bar">
                            <input
                                type="text"
                                placeholder="🔍 Tìm theo nội dung, người gửi, mã GD..."
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setTxPage(1); }}
                                className="search-input"
                            />
                            {searchQuery && (
                                <div className="search-result-count">Tìm thấy {filteredTx.length} kết quả</div>
                            )}
                        </div>

                        {/* Transactions list */}
                        {loadingTx ? (
                            <div className="loading-state">⏳ Đang tải giao dịch...</div>
                        ) : (
                            <>
                                <div className="tx-list">
                                    {paginatedTx.map(t => (
                                        <div key={t.id} className={`tx-item ${t.huong_giao_dich}`}>
                                            <div className="tx-top">
                                                <span className="tx-date">
                                                    📅 {new Date(t.created_at).toLocaleString('vi-VN')}
                                                </span>
                                                <span className={`tx-amount ${t.huong_giao_dich}`}>
                                                    {t.huong_giao_dich === 'in' ? '+' : '-'}{t.so_tien?.toLocaleString()}đ
                                                </span>
                                            </div>
                                            <div className="tx-body">
                                                <div className="tx-row">
                                                    <span className="tx-label">👤 Người gửi</span>
                                                    <span className="tx-val">{t.nguoi_nop}</span>
                                                </div>
                                                <div className="tx-row">
                                                    <span className="tx-label">📝 Nội dung</span>
                                                    <span className="tx-val content">{t.noi_dung_goc || 'Không có nội dung'}</span>
                                                </div>
                                                <div className="tx-footer">
                                                    <span className={`badge badge-${t.loai_giao_dich}`}>
                                                        {t.loai_giao_dich === 'nop_phat' ? '🚨 Nộp phạt' :
                                                            t.loai_giao_dich === 'nop_quy' ? '🏆 Nộp quỹ' : '📝 Khác'}
                                                    </span>
                                                    <span className="tx-code">🔢 {t.ma_giao_dich || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </div>
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
                    </div>
                )}
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
