'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import './admin.css';

export default function AdminPage() {
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
    const [newMember, setNewMember] = useState({ full_name: '', phone: '', email: '' });

    // Check authentication
    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push('/login');
            return;
        }
        loadData();
    }

    async function loadData() {
        setLoading(true);
        await Promise.all([loadTransactions(), loadMembers()]);
        setLoading(false);
    }

    async function loadTransactions() {
        const { data, error } = await supabase
            .from('quy_pickleball')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading transactions:', error);
        } else {
            setTransactions(data || []);
        }
    }

    async function loadMembers() {
        const { data, error } = await supabase
            .from('club_members')
            .select('*')
            .order('full_name', { ascending: true });

        if (error) {
            console.error('Error loading members:', error);
        } else {
            setMembers(data || []);
        }
    }

    const filteredTransactions = transactions.filter(t => {
        if (filterCategory !== 'all' && t.loai_giao_dich !== filterCategory) return false;
        if (filterDirection !== 'all' && t.huong_giao_dich !== filterDirection) return false;
        if (filterMember !== 'all' && t.nguoi_nop !== filterMember) return false;
        if (searchQuery && !t.noi_dung_goc?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    async function updateTransaction(id, updates) {
        const { error } = await supabase
            .from('quy_pickleball')
            .update(updates)
            .eq('id', id);

        if (error) {
            alert('Lỗi cập nhật: ' + error.message);
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

        const { error } = await supabase
            .from('club_members')
            .insert([{
                full_name: newMember.full_name.toUpperCase().trim(),
                phone: newMember.phone.trim() || null,
                email: newMember.email.trim() || null
            }]);

        if (error) {
            alert('Lỗi thêm thành viên: ' + error.message);
        } else {
            loadMembers();
            setAddingMember(false);
            setNewMember({ full_name: '', phone: '', email: '' });
        }
    }

    async function deleteMember(id) {
        if (!confirm('Bạn có chắc muốn xóa thành viên này?')) return;

        const { error } = await supabase
            .from('club_members')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Lỗi xóa: ' + error.message);
        } else {
            loadMembers();
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
        await supabase.auth.signOut();
        router.push('/login');
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
                <div className="admin-header">
                    <div className="header-content">
                        <div>
                            <h1>🎾 Quản lý Quỹ Pickleball</h1>
                            <p className="admin-subtitle">Hệ thống theo dõi giao dịch và thành viên</p>
                        </div>
                        <div className="header-buttons">
                            <a href="/" className="btn-home">
                                🏠 Trang chủ
                            </a>
                            <button onClick={handleLogout} className="btn-logout">
                                🚪 Đăng xuất
                            </button>
                        </div>
                    </div>
                </div>

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
                        </div>

                        {/* Transactions Table */}
                        <div className="table-card">
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
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
                                            <tr key={t.id} className={t.is_manually_categorized ? 'manually-edited' : ''}>
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
                                        <th>Tên đầy đủ</th>
                                        <th>Điện thoại</th>
                                        <th>Email</th>
                                        <th>Trạng thái</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map(m => (
                                        <tr key={m.id}>
                                            <td className="font-medium">{m.full_name}</td>
                                            <td>{m.phone || '-'}</td>
                                            <td>{m.email || '-'}</td>
                                            <td>
                                                <span className={`badge ${m.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                                    {m.is_active ? '✅ Hoạt động' : '⏸️ Ngừng'}
                                                </span>
                                            </td>
                                            <td>
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
                            <label>Điện thoại</label>
                            <input
                                type="text"
                                value={newMember.phone}
                                onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                                placeholder="0123456789"
                            />
                        </div>

                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                value={newMember.email}
                                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                                placeholder="email@example.com"
                            />
                        </div>

                        <div className="modal-actions">
                            <button className="btn-primary" onClick={addMember}>
                                ✅ Thêm
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    setAddingMember(false);
                                    setNewMember({ full_name: '', phone: '', email: '' });
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
