'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import HomeHeader from '@/components/HomeHeader';
import UserStatusBadge from '@/components/UserStatusBadge';
import './transactions.css';

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterDirection, setFilterDirection] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    useEffect(() => {
        loadTransactions();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterDirection, searchQuery]);

    async function loadTransactions() {
        setLoading(true);
        const { data, error } = await supabase
            .from('quy_pickleball')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error) setTransactions(data || []);
        setLoading(false);
    }

    const filteredTransactions = transactions.filter(t => {
        if (filterDirection !== 'all' && t.huong_giao_dich !== filterDirection) return false;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (t.noi_dung_goc || '').toLowerCase().includes(query)
                || (t.nguoi_nop || '').toLowerCase().includes(query)
                || (t.ma_giao_dich || '').toLowerCase().includes(query);
        }
        return true;
    });

    const paginatedTransactions = filteredTransactions.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

    const stats = {
        totalIn: transactions.filter(t => t.huong_giao_dich === 'in').reduce((sum, t) => sum + (t.so_tien || 0), 0),
        totalOut: transactions.filter(t => t.huong_giao_dich === 'out').reduce((sum, t) => sum + Math.abs(t.so_tien || 0), 0),
    };
    stats.balance = stats.totalIn - stats.totalOut;

    if (loading) {
        return (
            <div className="transactions-container loading">
                <div className="loading-text">⏳ Đang tải...</div>
            </div>
        );
    }

    return (
        <div className="transactions-container">
            <HomeHeader />

            <div className="transactions-content">
                {/* Header */}
                <div className="page-header">
                    <div>
                        <h1>📑 Lịch sử giao dịch</h1>
                        <p className="page-subtitle">Chi tiết tiền vào & tiền ra của quỹ CLB</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <UserStatusBadge />
                        <a href="/" className="btn-back">← Trang chủ</a>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="stats-row">
                    <div className="stat-card balance">
                        <div className="stat-label">💰 Số dư quỹ</div>
                        <div className={`stat-value ${stats.balance >= 0 ? 'positive' : 'negative'}`}>
                            {stats.balance.toLocaleString('vi-VN')}đ
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">⬇️ Tổng tiền vào</div>
                        <div className="stat-value positive">{stats.totalIn.toLocaleString('vi-VN')}đ</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">⬆️ Tổng tiền ra</div>
                        <div className="stat-value negative">{stats.totalOut.toLocaleString('vi-VN')}đ</div>
                    </div>
                </div>

                {/* Filter */}
                <div className="filter-bar">
                    <button
                        className={`filter-btn ${filterDirection === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterDirection('all')}
                    >
                        📋 Tất cả ({transactions.length})
                    </button>
                    <button
                        className={`filter-btn ${filterDirection === 'in' ? 'active' : ''}`}
                        onClick={() => setFilterDirection('in')}
                    >
                        ⬇️ Tiền vào ({transactions.filter(t => t.huong_giao_dich === 'in').length})
                    </button>
                    <button
                        className={`filter-btn ${filterDirection === 'out' ? 'active' : ''}`}
                        onClick={() => setFilterDirection('out')}
                    >
                        ⬆️ Tiền ra ({transactions.filter(t => t.huong_giao_dich === 'out').length})
                    </button>
                </div>

                {/* Search Bar */}
                <div className="filter-bar" style={{ flexDirection: 'column' }}>
                    <input
                        type="text"
                        placeholder="🔍 Tìm kiếm theo nội dung, người gửi, mã GD..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            fontSize: '14px',
                            background: '#0d1117',
                            border: '1px solid #30363d',
                            borderRadius: '8px',
                            color: '#e6edf3',
                            outline: 'none',
                            fontFamily: 'inherit',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => { e.target.style.borderColor = '#8b5cf6'; }}
                        onBlur={(e) => { e.target.style.borderColor = '#30363d'; }}
                    />
                    {searchQuery && (
                        <div style={{ fontSize: '13px', color: '#6e7681', textAlign: 'center', marginTop: '4px' }}>
                            Tìm thấy {filteredTransactions.length} kết quả
                        </div>
                    )}
                </div>

                {/* Transactions List */}
                <div className="transactions-list">
                    {paginatedTransactions.map(t => (
                        <div key={t.id} className={`transaction-item ${t.huong_giao_dich}`}>
                            <div className="transaction-header">
                                <div className="transaction-date">
                                    📅 {new Date(t.created_at).toLocaleString('vi-VN')}
                                </div>
                                <div className={`transaction-amount ${t.huong_giao_dich === 'in' ? 'in' : 'out'}`}>
                                    {t.huong_giao_dich === 'in' ? '+' : '-'}{t.so_tien?.toLocaleString('vi-VN')}đ
                                </div>
                            </div>

                            <div className="transaction-body">
                                <div className="transaction-info">
                                    <span className="label">👤 Người gửi:</span>
                                    <span className="value">{t.nguoi_nop}</span>
                                </div>
                                <div className="transaction-info">
                                    <span className="label">📝 Nội dung:</span>
                                    <span className="value content">{t.noi_dung_goc || 'Không có nội dung'}</span>
                                </div>
                                <div className="transaction-footer">
                                    <span className={`badge badge-${t.loai_giao_dich}`}>
                                        {t.loai_giao_dich === 'nop_phat' ? '🚨 Nộp phạt' :
                                            t.loai_giao_dich === 'nop_quy' ? '🏆 Nộp quỹ' : '📝 Khác'}
                                    </span>
                                    <span className="transaction-code">
                                        🔢 {t.ma_giao_dich || 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {filteredTransactions.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-icon">📭</div>
                            <div>Chưa có giao dịch nào</div>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {filteredTransactions.length > itemsPerPage && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '16px',
                        marginTop: '28px',
                        padding: '20px 0',
                    }}>
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="filter-btn"
                            style={{ flex: 'none', minWidth: 'auto', opacity: currentPage === 1 ? 0.4 : 1 }}
                        >
                            ← Trước
                        </button>
                        <span style={{ fontSize: '15px', fontWeight: '600', color: '#8b949e' }}>
                            Trang {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage >= totalPages}
                            className="filter-btn"
                            style={{ flex: 'none', minWidth: 'auto', opacity: currentPage >= totalPages ? 0.4 : 1 }}
                        >
                            Sau →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
