'use client';
import { useEffect, useState } from 'react';
import './members.css';

export default function MembersPage() {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all'); // all | active | inactive

    useEffect(() => {
        loadMembers();
    }, []);

    async function loadMembers() {
        setLoading(true);
        const res = await fetch('/api/club/members');
        const data = await res.json();
        setMembers(res.ok ? (data.members || []) : []);
        setLoading(false);
    }

    const filtered = members.filter(m => {
        if (filterStatus === 'active') return m.is_active;
        if (filterStatus === 'inactive') return !m.is_active;
        return true;
    });

    const activeCount = members.filter(m => m.is_active).length;
    const inactiveCount = members.filter(m => !m.is_active).length;

    return (
        <div className="members-page">
            <div className="members-main">
                {/* Header */}
                <div className="members-header">
                    <div>
                        <h1 className="members-title">👥 Thành viên CLB</h1>
                        <p className="members-subtitle">Danh sách thành viên Pickleball 246</p>
                    </div>
                    <div className="members-summary">
                        <div className="summary-badge active-badge">
                            ✅ {activeCount} đang hoạt động
                        </div>
                        {inactiveCount > 0 && (
                            <div className="summary-badge inactive-badge">
                                ⏸ {inactiveCount} tạm nghỉ
                            </div>
                        )}
                    </div>
                </div>

                {/* Filter */}
                <div className="members-filter">
                    {[
                        { key: 'all', label: `👥 Tất cả (${members.length})` },
                        { key: 'active', label: `✅ Đang hoạt động (${activeCount})` },
                        { key: 'inactive', label: `⏸ Tạm nghỉ (${inactiveCount})` },
                    ].map(f => (
                        <button
                            key={f.key}
                            className={`filter-btn ${filterStatus === f.key ? 'active' : ''}`}
                            onClick={() => setFilterStatus(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Table */}
                {loading ? (
                    <div className="loading-state">⏳ Đang tải danh sách...</div>
                ) : (
                    <div className="members-table-wrap">
                        <table className="members-table">
                            <thead>
                                <tr>
                                    <th className="col-stt">STT</th>
                                    <th className="col-name">Họ và tên</th>
                                    <th className="col-status">Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((m, idx) => (
                                    <tr key={m.id} className={`member-row ${!m.is_active ? 'inactive-row' : ''}`}>
                                        <td className="col-stt">
                                            <span className="stt-badge">{idx + 1}</span>
                                        </td>
                                        <td className="col-name">
                                            <div className="member-name-wrap">
                                                <div className="member-avatar">
                                                    {m.full_name.charAt(m.full_name.lastIndexOf(' ') + 1)}
                                                </div>
                                                <span className="member-fullname">{m.full_name}</span>
                                            </div>
                                        </td>
                                        <td className="col-status">
                                            {m.is_active ? (
                                                <span className="status-badge status-active">✅ Đang hoạt động</span>
                                            ) : (
                                                <span className="status-badge status-inactive">⏸ Tạm nghỉ</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {filtered.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-icon">👥</div>
                                <p>Không có thành viên nào</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
