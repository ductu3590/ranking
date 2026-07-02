'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import './share.css';

export default function ShareEventPage() {
    const { id } = useParams();
    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!id) return;
        async function load() {
            setLoading(true);
            try {
                const res = await fetch(`/api/club/events/${id}`);
                if (!res.ok) throw new Error('Không tìm thấy sự kiện');
                const data = await res.json();
                setEvent(data.event);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

    const formatMoney = (amount) => new Intl.NumberFormat('vi-VN').format(amount) + 'đ';

    async function handleCopyLink() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const input = document.createElement('input');
            input.value = window.location.href;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }

    if (loading) {
        return (
            <div className="share-page">
                <div className="share-loading">
                    <div className="share-spinner"></div>
                    <p>Đang tải thông tin sự kiện...</p>
                </div>
            </div>
        );
    }

    if (error || !event) {
        return (
            <div className="share-page">
                <div className="share-error">
                    <div className="share-error-icon">😕</div>
                    <h2>Không tìm thấy sự kiện</h2>
                    <p>Sự kiện này có thể đã bị xóa hoặc đường dẫn không hợp lệ.</p>
                    <a href="/quy" className="share-back-link">← Về trang quỹ</a>
                </div>
            </div>
        );
    }

    const participants = event.fund_event_participants || [];
    const paidList = participants.filter(p => p.has_paid);
    const unpaidList = participants.filter(p => !p.has_paid);
    const total = participants.length;
    const paidCount = paidList.length;
    const pct = total > 0 ? Math.round((paidCount / total) * 100) : 0;
    const totalCollected = paidCount * (event.amount_per_person || 0);
    const totalExpected = total * (event.amount_per_person || 0);

    return (
        <div className="share-page">
            <div className="share-container">
                {/* Header */}
                <div className="share-header">
                    <div className="share-header-top">
                        <a href="/quy" className="share-back-btn">← Quỹ CLB</a>
                        <button
                            className={`share-copy-btn ${copied ? 'copied' : ''}`}
                            onClick={handleCopyLink}
                        >
                            {copied ? '✅ Đã sao chép!' : '🔗 Sao chép link'}
                        </button>
                    </div>
                    <div className="share-hero">
                        <div className="share-badge">📋 Sự kiện đóng quỹ</div>
                        <h1 className="share-title">{event.title}</h1>
                        {event.description && (
                            <p className="share-desc">{event.description}</p>
                        )}
                        <div className="share-meta">
                            {event.event_date && (
                                <span className="share-meta-item">
                                    📅 {new Date(event.event_date).toLocaleDateString('vi-VN', {
                                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                                    })}
                                </span>
                            )}
                            {event.amount_per_person > 0 && (
                                <span className="share-meta-item share-meta-amount">
                                    💵 {formatMoney(event.amount_per_person)} / người
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Progress Section */}
                <div className="share-progress-card">
                    <div className="share-progress-stats">
                        <div className="share-stat">
                            <span className="share-stat-number">{paidCount}</span>
                            <span className="share-stat-label">Đã đóng</span>
                        </div>
                        <div className="share-stat-divider"></div>
                        <div className="share-stat">
                            <span className="share-stat-number share-stat-total">{total}</span>
                            <span className="share-stat-label">Tổng số</span>
                        </div>
                        {event.amount_per_person > 0 && (
                            <>
                                <div className="share-stat-divider"></div>
                                <div className="share-stat">
                                    <span className="share-stat-number share-stat-money">
                                        {formatMoney(totalCollected)}
                                    </span>
                                    <span className="share-stat-label">
                                        / {formatMoney(totalExpected)}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="share-progress-bar-wrap">
                        <div className="share-progress-bar">
                            <div
                                className="share-progress-fill"
                                style={{ width: `${pct}%` }}
                            ></div>
                        </div>
                        <span className="share-progress-pct">{pct}%</span>
                    </div>
                </div>

                {/* Members Grid */}
                <div className="share-members">
                    {/* Chưa đóng */}
                    <div className="share-column">
                        <div className="share-col-header unpaid">
                            <span className="share-col-icon">❌</span>
                            <span>Chưa đóng</span>
                            <span className="share-col-count">{unpaidList.length}</span>
                        </div>
                        <div className="share-col-body">
                            {unpaidList.length === 0 ? (
                                <div className="share-col-empty">✅ Tất cả đã đóng!</div>
                            ) : (
                                unpaidList.map((p, i) => (
                                    <div key={p.id} className="share-member-row unpaid">
                                        <span className="share-member-index">{i + 1}</span>
                                        <span className="share-member-name">
                                            {p.club_members?.full_name || 'N/A'}
                                        </span>
                                        {event.amount_per_person > 0 && (
                                            <span className="share-member-amount unpaid">
                                                {formatMoney(event.amount_per_person)}
                                            </span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Đã đóng */}
                    <div className="share-column">
                        <div className="share-col-header paid">
                            <span className="share-col-icon">✅</span>
                            <span>Đã đóng</span>
                            <span className="share-col-count">{paidList.length}</span>
                        </div>
                        <div className="share-col-body">
                            {paidList.length === 0 ? (
                                <div className="share-col-empty">Chưa có ai đóng</div>
                            ) : (
                                paidList.map((p, i) => (
                                    <div key={p.id} className="share-member-row paid">
                                        <span className="share-member-index">{i + 1}</span>
                                        <span className="share-member-name">
                                            {p.club_members?.full_name || 'N/A'}
                                        </span>
                                        <div className="share-member-right">
                                            {p.paid_at && (
                                                <span className="share-paid-date">
                                                    {new Date(p.paid_at).toLocaleDateString('vi-VN')}
                                                </span>
                                            )}
                                            {event.amount_per_person > 0 && (
                                                <span className="share-member-amount paid">
                                                    {formatMoney(event.amount_per_person)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="share-footer">
                    <p>Quỹ CLB Pickleball 246</p>
                </div>
            </div>
        </div>
    );
}
