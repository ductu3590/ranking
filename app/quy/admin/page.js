'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './admin.css';
import UserStatusBadge from '@/components/UserStatusBadge';

export default function AdminPage({ embedded = false }) {
    const [transactions, setTransactions] = useState([]);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('transactions');
    const router = useRouter();

    // Filters
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterDirection, setFilterDirection] = useState('all');
    const [filterMember, setFilterMember] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Edit modal
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [editForm, setEditForm] = useState({});

    // Member modal
    const [addingMember, setAddingMember] = useState(false);
    const [newMember, setNewMember] = useState({ full_name: '', aliasesText: '' });

    // Edit member modal
    const [editingMember, setEditingMember] = useState(null);
    const [editMemberForm, setEditMemberForm] = useState({});

    // Bulk edit states
    const [selectedTransactions, setSelectedTransactions] = useState([]);
    const [bulkEditCategory, setBulkEditCategory] = useState('nop_phat');

    // Manual expense states
    const [addingExpense, setAddingExpense] = useState(false);
    const [expenseForm, setExpenseForm] = useState({
        direction: 'out', // 'in' = Thu (income), 'out' = Chi (expense)
        so_tien: '',
        loai_giao_dich: 'khac',
        noi_dung: '',
        ngay_giao_dich: new Date().toISOString().split('T')[0],
        ghi_chu: ''
    });

    // Check authentication
    useEffect(() => {
        if (!embedded) {
            router.replace('/admin');
            return;
        }
        let active = true;
        async function loadAuthorizedData() {
            const response = await fetch('/api/groups/session', { cache: 'no-store' });
            const sessionView = await response.json();
            if (!active) return;
            if (!sessionView.permissions?.canManageFund) {
                router.replace('/');
                return;
            }
            loadData();
        }
        loadAuthorizedData();
        return () => { active = false; };
        // Data loading is intentionally coupled to the one-time server permission check.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embedded, router]);

    async function loadData() {
        setLoading(true);
        await Promise.all([loadTransactions(), loadMembers()]);
        setLoading(false);
    }

    async function loadTransactions() {
        const res = await fetch('/api/club/transactions');
        const data = await res.json();
        setTransactions(res.ok ? (data.transactions || []) : []);
    }

    async function loadMembers() {
        const res = await fetch('/api/club/members');
        const data = await res.json();
        setMembers(res.ok ? (data.members || []) : []);
    }

    const filteredTransactions = transactions.filter(t => {
        if (filterCategory !== 'all' && t.loai_giao_dich !== filterCategory) return false;
        if (filterDirection !== 'all' && t.huong_giao_dich !== filterDirection) return false;
        if (filterMember !== 'all' && t.nguoi_nop !== filterMember) return false;
        if (searchQuery && !t.noi_dung_goc?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    async function updateTransaction(id, updates) {
        const res = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [id], updates }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi cập nhật: ' + (data.error || ''));
        } else {
            loadTransactions();
            setEditingTransaction(null);
        }
    }

    async function addMember() {
        if (!newMember.full_name.trim()) {
            alert('Vui lòng nhập tên thành viên');
            return;
        }

        // Parse aliases from textarea (one per line)
        let aliasesArray = [];
        if (newMember.aliasesText) {
            aliasesArray = newMember.aliasesText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        }

        const res = await fetch('/api/club/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: newMember.full_name, aliases: aliasesArray }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi thêm thành viên: ' + (data.error || ''));
        } else {
            loadMembers();
            setAddingMember(false);
            setNewMember({ full_name: '', aliasesText: '' });
        }
    }

    async function deleteMember(id) {
        if (!confirm('Bạn có chắc muốn xóa thành viên này?')) return;
        const res = await fetch(`/api/club/members?id=${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi xóa: ' + (data.error || ''));
        } else {
            loadMembers();
        }
    }

    async function updateMember() {
        if (!editMemberForm.full_name?.trim()) {
            alert('Tên thành viên không được để trống');
            return;
        }

        // Parse aliases from textarea (one per line)
        let aliasesArray = [];
        if (editMemberForm.aliasesText) {
            aliasesArray = editMemberForm.aliasesText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        }

        const res = await fetch('/api/club/members', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingMember.id, aliases: aliasesArray, is_active: editMemberForm.is_active }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi cập nhật: ' + (data.error || ''));
        } else {
            loadMembers();
            setEditingMember(null);
            setEditMemberForm({});
        }
    }

    // Bulk edit functions
    function handleSelectAll(e) {
        if (e.target.checked) {
            setSelectedTransactions(filteredTransactions.map(t => t.id));
        } else {
            setSelectedTransactions([]);
        }
    }

    function handleSelectTransaction(id) {
        setSelectedTransactions(prev => {
            if (prev.includes(id)) {
                return prev.filter(tid => tid !== id);
            } else {
                return [...prev, id];
            }
        });
    }

    async function handleBulkUpdate() {
        if (selectedTransactions.length === 0) {
            alert('Vui lòng chọn ít nhất một giao dịch');
            return;
        }

        if (!confirm(`Bạn có chắc muốn cập nhật ${selectedTransactions.length} giao dịch thành "${bulkEditCategory === 'nop_phat' ? 'Nộp phạt' : bulkEditCategory === 'nop_quy' ? 'Nộp quỹ' : 'Khác'}"?`)) {
            return;
        }

        const res = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ids: selectedTransactions,
                updates: { loai_giao_dich: bulkEditCategory, is_manually_categorized: true },
            }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi: ' + (data.error || ''));
            return;
        }
        alert(`Đã cập nhật ${selectedTransactions.length} giao dịch!`);
        setSelectedTransactions([]);
        loadTransactions();
    }

    async function addExpenseTransaction() {
        // Validate
        if (!expenseForm.so_tien || parseFloat(expenseForm.so_tien) <= 0) {
            alert('Vui lòng nhập số tiền hợp lệ (> 0)');
            return;
        }
        if (!expenseForm.noi_dung.trim()) {
            alert('Vui lòng nhập nội dung giao dịch');
            return;
        }

        const res = await fetch('/api/club/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                direction: expenseForm.direction,
                so_tien: expenseForm.so_tien,
                loai_giao_dich: expenseForm.loai_giao_dich,
                noi_dung: expenseForm.noi_dung,
                ngay_giao_dich: expenseForm.ngay_giao_dich,
                ghi_chu: expenseForm.ghi_chu,
            }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi thêm giao dịch: ' + (data.error || ''));
        } else {
            const isIncome = expenseForm.direction === 'in';
            alert(isIncome ? 'Đã thêm giao dịch thu thành công!' : 'Đã thêm giao dịch chi thành công!');
            setAddingExpense(false);
            setExpenseForm({ direction: 'out', so_tien: '', loai_giao_dich: 'khac', noi_dung: '', ngay_giao_dich: new Date().toISOString().split('T')[0], ghi_chu: '' });
            loadTransactions();
        }
    }

    // Calculate stats
    const stats = {
        totalIn: transactions.filter(t => t.huong_giao_dich === 'in').reduce((sum, t) => sum + (t.so_tien || 0), 0),
        totalOut: transactions.filter(t => t.huong_giao_dich === 'out').reduce((sum, t) => sum + (t.so_tien || 0), 0),
        totalPenalty: transactions.filter(t => t.loai_giao_dich === 'nop_phat').reduce((sum, t) => sum + (t.so_tien || 0), 0),
        totalFund: transactions.filter(t => t.loai_giao_dich === 'nop_quy').reduce((sum, t) => sum + (t.so_tien || 0), 0),
        lowConfidence: transactions.filter(t => t.confidence_score < 70).length,
        manualCategorized: transactions.filter(t => t.is_manually_categorized).length
    };
    stats.balance = stats.totalIn - stats.totalOut;

    async function handleLogout() {
        try {
            await fetch('/api/groups/session', { method: 'DELETE' });
        } catch {
            // Ignore network errors; the homepage can still use the remembered group.
        }
        router.push('/');
    }

    if (loading) {
        return (
            <div className="admin-container loading">
                <div className="loading-text">⏳ Đang tải...</div>
            </div>
        );
    }

    return (
        <div className="admin-container">
            <div className="admin-content">
                {!embedded && <div className="admin-header">
                    <div className="header-content">
                        <div>
                            <h1>🎾 Quản lý Quỹ Pickleball</h1>
                            <p className="admin-subtitle">Hệ thống theo dõi giao dịch và thành viên</p>
                        </div>
                        <div className="header-buttons">
                            <UserStatusBadge />
                            <a href="/quy" className="btn-home">
                                🏠 Trang chủ
                            </a>
                            <button onClick={handleLogout} className="btn-logout">
                                🚪 Đăng xuất
                            </button>
                        </div>
                    </div>
                </div>}

                {/* Tabs */}
                <div className="tabs">
                    <button
                        className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('transactions')}
                    >
                        📋 Giao dịch
                    </button>
                    <button
                        className={`tab ${activeTab === 'members' ? 'active' : ''}`}
                        onClick={() => setActiveTab('members')}
                    >
                        👥 Thành viên
                    </button>
                    <button
                        className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stats')}
                    >
                        📊 Thống kê
                    </button>
                </div>

                {/* TRANSACTIONS TAB */}
                {activeTab === 'transactions' && (
                    <div>
                        {/* Filters */}
                        <div className="filter-card">
                            <div className="filter-grid">
                                <div className="filter-item">
                                    <label>Loại giao dịch</label>
                                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                                        <option value="all">Tất cả</option>
                                        <option value="nop_phat">Nộp phạt</option>
                                        <option value="nop_quy">Nộp quỹ</option>
                                        <option value="khac">Khác</option>
                                    </select>
                                </div>
                                <div className="filter-item">
                                    <label>Hướng</label>
                                    <select value={filterDirection} onChange={(e) => setFilterDirection(e.target.value)}>
                                        <option value="all">Tất cả</option>
                                        <option value="in">Tiền vào</option>
                                        <option value="out">Tiền ra</option>
                                    </select>
                                </div>
                                <div className="filter-item">
                                    <label>Thành viên</label>
                                    <select value={filterMember} onChange={(e) => setFilterMember(e.target.value)}>
                                        <option value="all">Tất cả</option>
                                        {members.map(m => (
                                            <option key={m.id} value={m.full_name}>{m.full_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="filter-item">
                                    <label>Tìm kiếm</label>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Nội dung giao dịch..."
                                    />
                                </div>
                            </div>
                            <div className="action-bar" style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #e5e7eb' }}>
                                <button
                                    className="btn-income"
                                    onClick={() => {
                                        setExpenseForm((p) => ({ ...p, direction: 'in', loai_giao_dich: 'nop_quy' }));
                                        setAddingExpense(true);
                                    }}
                                >
                                    💰 Thu
                                </button>
                                <button
                                    className="btn-expense"
                                    onClick={() => {
                                        setExpenseForm((p) => ({ ...p, direction: 'out', loai_giao_dich: 'khac' }));
                                        setAddingExpense(true);
                                    }}
                                >
                                    💸 Chi
                                </button>
                            </div>
                        </div>

                        {/* Bulk Edit Toolbar */}
                        {selectedTransactions.length > 0 && (
                            <div className="bulk-edit-toolbar">
                                <span className="toolbar-label">✓ {selectedTransactions.length} giao dịch được chọn</span>
                                <select
                                    value={bulkEditCategory}
                                    onChange={(e) => setBulkEditCategory(e.target.value)}
                                >
                                    <option value="nop_phat">Nộp phạt</option>
                                    <option value="nop_quy">Nộp quỹ</option>
                                    <option value="khac">Khác</option>
                                </select>
                                <button className="btn-apply" onClick={handleBulkUpdate}>
                                    ✅ Áp dụng
                                </button>
                                <button className="btn-clear" onClick={() => setSelectedTransactions([])}>
                                    ✖ Bỏ chọn
                                </button>
                            </div>
                        )}

                        {/* Transactions Table */}
                        <div className="table-card">
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th className="checkbox-cell">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTransactions.length === filteredTransactions.length && filteredTransactions.length > 0}
                                                    onChange={handleSelectAll}
                                                />
                                            </th>
                                            <th>Ngày</th>
                                            <th>Thành viên</th>
                                            <th>Số tiền</th>
                                            <th>Loại</th>
                                            <th>Hướng</th>
                                            <th>Confidence</th>
                                            <th>Nội dung</th>
                                            <th>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTransactions.map(t => (
                                            <tr
                                                key={t.id}
                                                className={`${t.is_manually_categorized ? 'manually-edited' : ''} ${selectedTransactions.includes(t.id) ? 'selected' : ''}`}
                                            >
                                                <td className="checkbox-cell">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTransactions.includes(t.id)}
                                                        onChange={() => handleSelectTransaction(t.id)}
                                                    />
                                                </td>
                                                <td>{new Date(t.created_at).toLocaleDateString('vi-VN')}</td>
                                                <td className="font-medium">{t.nguoi_nop}</td>
                                                <td>
                                                    <span className={`amount ${t.huong_giao_dich === 'in' ? 'in' : 'out'}`}>
                                                        {t.huong_giao_dich === 'in' ? '+' : '-'}{t.so_tien?.toLocaleString()}đ
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge badge-${t.loai_giao_dich}`}>
                                                        {t.loai_giao_dich === 'nop_phat' ? 'Nộp phạt' :
                                                            t.loai_giao_dich === 'nop_quy' ? 'Nộp quỹ' : 'Khác'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge badge-direction-${t.huong_giao_dich}`}>
                                                        {t.huong_giao_dich === 'in' ? '⬇️ Vào' : '⬆️ Ra'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`confidence ${t.confidence_score < 70 ? 'low' : ''}`}>
                                                        {t.confidence_score}%
                                                    </span>
                                                </td>
                                                <td className="content-cell" title={t.noi_dung_goc}>{t.noi_dung_goc}</td>
                                                <td>
                                                    <button
                                                        className="btn-edit"
                                                        onClick={() => {
                                                            setEditingTransaction(t);
                                                            setEditForm(t);
                                                        }}
                                                    >
                                                        ✏️ Sửa
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredTransactions.length === 0 && (
                                    <div className="empty-state">Không có giao dịch nào</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* MEMBERS TAB */}
                {activeTab === 'members' && (
                    <div>
                        <div className="action-bar">
                            <button className="btn-primary" onClick={() => setAddingMember(true)}>
                                ➕ Thêm thành viên
                            </button>
                        </div>

                        <div className="table-card">
                            <table>
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Tên đầy đủ</th>
                                        <th>Aliases</th>
                                        <th>Trạng thái</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map((m, index) => (
                                        <tr key={m.id}>
                                            <td style={{ textAlign: 'center', fontWeight: '500' }}>{index + 1}</td>
                                            <td className="font-medium">{m.full_name}</td>
                                            <td style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                                {m.aliases && m.aliases.length > 0 ? m.aliases.join(', ') : '-'}
                                            </td>
                                            <td>
                                                <span className={`badge ${m.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                                    {m.is_active ? '✅ Hoạt động' : '⏸️ Ngừng'}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className="btn-edit"
                                                    onClick={() => {
                                                        setEditingMember(m);
                                                        setEditMemberForm({
                                                            full_name: m.full_name,
                                                            aliasesText: m.aliases ? m.aliases.join('\n') : '',
                                                            is_active: m.is_active
                                                        });
                                                    }}
                                                    style={{ marginRight: '8px' }}
                                                >
                                                    ✏️ Sửa
                                                </button>
                                                <button className="btn-delete" onClick={() => deleteMember(m.id)}>
                                                    🗑️ Xóa
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* STATS TAB */}
                {activeTab === 'stats' && (
                    <div className="stats-grid">
                        <div className="stat-card balance">
                            <div className="stat-label">💰 Số dư quỹ</div>
                            <div className={`stat-value ${stats.balance >= 0 ? 'positive' : 'negative'}`}>
                                {stats.balance.toLocaleString()}đ
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">⬇️ Tổng tiền vào</div>
                            <div className="stat-value positive">{stats.totalIn.toLocaleString()}đ</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">⬆️ Tổng tiền ra</div>
                            <div className="stat-value negative">{stats.totalOut.toLocaleString()}đ</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">🚨 Nộp phạt</div>
                            <div className="stat-value penalty">{stats.totalPenalty.toLocaleString()}đ</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">🏆 Nộp quỹ</div>
                            <div className="stat-value fund">{stats.totalFund.toLocaleString()}đ</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">⚠️ GD confidence thấp</div>
                            <div className="stat-value warning">{stats.lowConfidence}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingTransaction && (
                <div className="modal-overlay" onClick={() => setEditingTransaction(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>✏️ Chỉnh sửa giao dịch</h2>

                        <div className="form-group">
                            <label>Thành viên</label>
                            <select
                                value={editForm.nguoi_nop}
                                onChange={(e) => setEditForm({ ...editForm, nguoi_nop: e.target.value })}
                            >
                                {members.map(m => (
                                    <option key={m.id} value={m.full_name}>{m.full_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Loại giao dịch</label>
                            <select
                                value={editForm.loai_giao_dich}
                                onChange={(e) => setEditForm({ ...editForm, loai_giao_dich: e.target.value })}
                            >
                                <option value="nop_phat">Nộp phạt</option>
                                <option value="nop_quy">Nộp quỹ</option>
                                <option value="khac">Khác</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Hướng</label>
                            <select
                                value={editForm.huong_giao_dich}
                                onChange={(e) => setEditForm({ ...editForm, huong_giao_dich: e.target.value })}
                            >
                                <option value="in">Tiền vào</option>
                                <option value="out">Tiền ra</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Ghi chú admin</label>
                            <textarea
                                value={editForm.admin_note || ''}
                                onChange={(e) => setEditForm({ ...editForm, admin_note: e.target.value })}
                                rows="3"
                            />
                        </div>

                        <div className="modal-actions">
                            <button
                                className="btn-primary"
                                onClick={() => {
                                    updateTransaction(editingTransaction.id, {
                                        nguoi_nop: editForm.nguoi_nop,
                                        loai_giao_dich: editForm.loai_giao_dich,
                                        huong_giao_dich: editForm.huong_giao_dich,
                                        admin_note: editForm.admin_note,
                                        is_manually_categorized: true
                                    });
                                }}
                            >
                                💾 Lưu
                            </button>
                            <button className="btn-secondary" onClick={() => setEditingTransaction(null)}>
                                ❌ Hủy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Member Modal */}
            {addingMember && (
                <div className="modal-overlay" onClick={() => setAddingMember(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>➕ Thêm thành viên mới</h2>

                        <div className="form-group">
                            <label>Tên đầy đủ *</label>
                            <input
                                type="text"
                                value={newMember.full_name}
                                onChange={(e) => setNewMember({ ...newMember, full_name: e.target.value })}
                                placeholder="NGUYỄN VĂN A"
                            />
                        </div>

                        <div className="form-group">
                            <label>Aliases (Các tên khác)</label>
                            <textarea
                                value={newMember.aliasesText}
                                onChange={(e) => setNewMember({ ...newMember, aliasesText: e.target.value })}
                                rows="5"
                                placeholder="Nhập mỗi alias trên một dòng, VD:&#10;NGUYÊN VĂN A&#10;VĂN A&#10;NV A"
                            />
                            <small style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '5px', display: 'block' }}>
                                💡 Nhập mỗi alias trên một dòng. Aliases giúp hệ thống nhận diện tên thành viên từ giao dịch.
                            </small>
                        </div>

                        <div className="modal-actions">
                            <button className="btn-primary" onClick={addMember}>
                                ✅ Thêm
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    setAddingMember(false);
                                    setNewMember({ full_name: '', aliasesText: '' });
                                }}
                            >
                                ❌ Hủy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Member Modal */}
            {editingMember && (
                <div className="modal-overlay" onClick={() => setEditingMember(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>✏️ Chỉnh sửa thành viên</h2>

                        <div className="form-group">
                            <label>Tên đầy đủ</label>
                            <input
                                type="text"
                                value={editMemberForm.full_name}
                                disabled
                                style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                            />
                            <small style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '5px', display: 'block' }}>
                                Tên không thể sửa đổi
                            </small>
                        </div>

                        <div className="form-group">
                            <label>Aliases (Các tên khác)</label>
                            <textarea
                                value={editMemberForm.aliasesText}
                                onChange={(e) => setEditMemberForm({ ...editMemberForm, aliasesText: e.target.value })}
                                rows="5"
                                placeholder="Nhập mỗi alias trên một dòng, VD:&#10;DO DUC TU&#10;DUC TU&#10;DD TU"
                            />
                            <small style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '5px', display: 'block' }}>
                                💡 Nhập mỗi alias trên một dòng. Aliases giúp hệ thống nhận diện tên thành viên từ giao dịch.
                            </small>
                        </div>

                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={editMemberForm.is_active}
                                    onChange={(e) => setEditMemberForm({ ...editMemberForm, is_active: e.target.checked })}
                                    style={{ marginRight: '8px', width: 'auto' }}
                                />
                                <span>Thành viên đang hoạt động</span>
                            </label>
                        </div>

                        <div className="modal-actions">
                            <button className="btn-primary" onClick={updateMember}>
                                💾 Lưu
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    setEditingMember(null);
                                    setEditMemberForm({});
                                }}
                            >
                                ❌ Hủy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Expense Modal */}
            {addingExpense && (
                <div className="modal-overlay" onClick={() => setAddingExpense(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{expenseForm.direction === 'in' ? '💰 Thêm Giao Dịch Thu' : '💸 Thêm Giao Dịch Chi'}</h2>

                        <div className="form-group">
                            <label>Số tiền *</label>
                            <input
                                type="number"
                                value={expenseForm.so_tien}
                                onChange={(e) => setExpenseForm({ ...expenseForm, so_tien: e.target.value })}
                                placeholder="Nhập số tiền (VD: 48000)"
                                min="0"
                                step="1000"
                            />
                            <small style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '5px', display: 'block' }}>
                                {expenseForm.direction === 'in'
                                    ? 'Nhập số tiền dương, hệ thống sẽ ghi nhận là tiền vào quỹ'
                                    : 'Nhập số tiền dương, hệ thống sẽ tự động chuyển thành tiền ra'}
                            </small>
                        </div>

                        <div className="form-group">
                            <label>Loại giao dịch</label>
                            <select
                                value={expenseForm.loai_giao_dich}
                                onChange={(e) => setExpenseForm({ ...expenseForm, loai_giao_dich: e.target.value })}
                            >
                                <option value="khac">Khác</option>
                                <option value="nop_phat">Nộp phạt</option>
                                <option value="nop_quy">Nộp quỹ</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Nội dung giao dịch *</label>
                            <input
                                type="text"
                                value={expenseForm.noi_dung}
                                onChange={(e) => setExpenseForm({ ...expenseForm, noi_dung: e.target.value })}
                                placeholder="VD: Trả tiền nước, Mua bóng..."
                            />
                        </div>

                        <div className="form-group">
                            <label>Ngày giao dịch</label>
                            <input
                                type="date"
                                value={expenseForm.ngay_giao_dich}
                                onChange={(e) => setExpenseForm({ ...expenseForm, ngay_giao_dich: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>Ghi chú</label>
                            <textarea
                                value={expenseForm.ghi_chu}
                                onChange={(e) => setExpenseForm({ ...expenseForm, ghi_chu: e.target.value })}
                                rows="3"
                                placeholder="Ghi chú thêm (tùy chọn)..."
                            />
                        </div>

                        <div className="modal-actions">
                            <button className="btn-primary" onClick={addExpenseTransaction}>
                                ✅ Thêm
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    setAddingExpense(false);
                                    setExpenseForm({
                                        direction: 'out',
                                        so_tien: '',
                                        loai_giao_dich: 'khac',
                                        noi_dung: '',
                                        ngay_giao_dich: new Date().toISOString().split('T')[0],
                                        ghi_chu: ''
                                    });
                                }}
                            >
                                ❌ Hủy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
