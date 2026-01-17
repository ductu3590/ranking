'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import './transactions.css';

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterDirection, setFilterDirection] = useState('all'); // all, in, out
    const [searchQuery, setSearchQuery] = useState(''); // For Ajax search
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    useEffect(() => {
        loadTransactions();
    }, []);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterDirection, searchQuery]);

    async function loadTransactions() {
        setLoading(true);
        const { data, error } = await supabase
            .from('quy_pickleball')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading transactions:', error);
        } else {
            setTransactions(data || []);
        }
        setLoading(false);
    }

    // Filter by direction and search query
    const filteredTransactions = transactions.filter(t => {
        // Filter by direction
        if (filterDirection !== 'all' && t.huong_giao_dich !== filterDirection) {
            return false;
        }

        // Filter by search query (Ajax)
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const content = (t.noi_dung_goc || '').toLowerCase();
            const sender = (t.nguoi_nop || '').toLowerCase();
            const code = (t.ma_giao_dich || '').toLowerCase();

            return content.includes(query) || sender.includes(query) || code.includes(query);
        }

        return true;
    });

    // Paginate filtered results
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
            <div className="transactions-content">
                {/* Header */}
                <div className="page-header">
                    <div>
                        <h1>💰 Theo dõi Quỹ</h1>
                        <p className="page-subtitle">Lịch sử giao dịch tiền vào & tiền ra</p>
                    </div>
                    <a href="/" className="btn-back">← Trang chủ</a>
                </div>

                {/* Stats Cards */}
                <div className="stats-row">
                    <div className="stat-card balance">
                        <div className="stat-label">Số dư quỹ</div>
                        <div className={`stat-value ${stats.balance >= 0 ? 'positive' : 'negative'}`}>
                            {stats.balance.toLocaleString()}đ
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">⬇️ Tiền vào</div>
                        <div className="stat-value positive">{stats.totalIn.toLocaleString()}đ</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">⬆️ Tiền ra</div>
                        <div className="stat-value negative">{stats.totalOut.toLocaleString()}đ</div>
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
                <div className="filter-bar" style={{ marginTop: '20px' }}>
                    <input
                        type="text"
                        placeholder="🔍 Tìm kiếm theo nội dung, người gửi, mã GD..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px 20px',
                            fontSize: '15px',
                            border: '2px solid #e0e0e0',
                            borderRadius: '12px',
                            outline: 'none',
                            transition: 'all 0.3s',
                            fontFamily: 'inherit'
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#667eea';
                            e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = '#e0e0e0';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                    {searchQuery && (
                        <div style={{
                            marginTop: '10px',
                            fontSize: '14px',
                            color: '#666',
                            textAlign: 'center'
                        }}>
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
                                    {t.huong_giao_dich === 'in' ? '+' : '-'}{t.so_tien?.toLocaleString()}đ
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

                {/* Pagination Controls */}
                {filteredTransactions.length > itemsPerPage && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '15px',
                        marginTop: '30px',
                        padding: '20px'
                    }}>
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="filter-btn"
                            style={{
                                opacity: currentPage === 1 ? 0.5 : 1,
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                            }}
                        >
                            ← Trước
                        </button>

                        <span style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#333'
                        }}>
                            Trang {currentPage} / {totalPages}
                        </span>

                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage >= totalPages}
                            className="filter-btn"
                            style={{
                                opacity: currentPage >= totalPages ? 0.5 : 1,
                                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer'
                            }}
                        >
                            Sau →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
