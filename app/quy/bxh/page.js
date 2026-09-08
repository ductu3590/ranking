'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildContributionLeaderboard } from '@/lib/fundLeaderboard';
import PhSeg from '@/components/pickhub/PhSeg';
import './page.css';

const PERIODS = [
    { value: 'week', label: 'Tuần này' },
    { value: 'month', label: 'Tháng này' },
    { value: 'year', label: 'Năm nay' },
    { value: 'all', label: 'Tất cả' },
];
const MEDALS = ['🏆 Dẫn đầu', '🥈 Á quân', '🥉 Hạng ba'];
const EXCLUDED_PAYERS = new Set(['', 'UNKNOWN', 'TAI KHOAN GOC', 'THỦ QUỸ']);
const money = new Intl.NumberFormat('vi-VN');
const date = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

function periodText(period) {
    if (!period?.start) return `Toàn bộ dữ liệu đến ${date.format(new Date(period.end))}`;
    return `${date.format(new Date(period.start))} – ${date.format(new Date(period.end))}`;
}

function initials(name) {
    return String(name || '').trim().split(/\s+/).pop()?.charAt(0).toLocaleUpperCase('vi-VN') || '?';
}

function amountText(amount) { return `${money.format(amount)}đ`; }

export default function FundLeaderboardPage() {
    const [period, setPeriod] = useState('week');
    const [transactions, setTransactions] = useState([]);
    const [members, setMembers] = useState([]);
    const [shameBadgesEnabled, setShameBadgesEnabled] = useState(true);
    const [loading, setLoading] = useState(true);
    const [accessState, setAccessState] = useState('loading');
    const [error, setError] = useState('');
    const [now, setNow] = useState(() => new Date());
    const [retry, setRetry] = useState(0);
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true);
            setError('');
            try {
                const [sessionRes, txRes, memberRes, brandRes] = await Promise.all([
                    fetch('/api/groups/session', { cache: 'no-store', signal: controller.signal }),
                    fetch('/api/club/transactions', { signal: controller.signal }),
                    fetch('/api/club/members', { signal: controller.signal }),
                    fetch('/api/club/branding', { signal: controller.signal }),
                ]);
                const session = await sessionRes.json();
                if (!session.permissions?.canViewClub) {
                    setAccessState('forbidden');
                    return;
                }
                const transactionsData = await txRes.json();
                const membersData = await memberRes.json();
                const brandData = await brandRes.json();
                if (!txRes.ok) throw new Error(transactionsData.error || 'Không thể tải giao dịch.');
                if (!memberRes.ok) throw new Error(membersData.error || 'Không thể tải danh sách thành viên.');
                setTransactions(transactionsData.transactions || []);
                setMembers(membersData.members || []);
                setShameBadgesEnabled(brandData.shameBadgesEnabled !== false);
                setNow(new Date());
                setAccessState('ready');
            } catch (loadError) {
                if (loadError.name !== 'AbortError') setError(loadError.message || 'Không thể tải BXH.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        load();
        return () => controller.abort();
    }, [retry]);

    const result = useMemo(() => buildContributionLeaderboard({
        transactions, members, period, now, shameBadgesEnabled,
    }), [transactions, members, period, now, shameBadgesEnabled]);

    const recent = useMemo(() => (transactions || [])
        .filter((tx) => tx?.huong_giao_dich === 'in' && Number(tx?.so_tien) > 0 && tx?.created_at
            && !EXCLUDED_PAYERS.has(String(tx?.nguoi_nop || '').trim().toLocaleUpperCase('vi-VN')))
        .map((tx) => ({ name: String(tx.nguoi_nop).trim(), amount: Number(tx.so_tien), at: new Date(tx.created_at) }))
        .filter((item) => !Number.isNaN(item.at.getTime()))
        .sort((a, b) => b.at - a.at)
        .slice(0, 6), [transactions]);

    async function shareBoard() {
        setSharing(true);
        try {
            const response = await fetch(`/api/club/bxh/share-image?period=${period}`);
            if (!response.ok) throw new Error('Không tạo được ảnh chia sẻ.');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bxh-${period}.svg`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (shareError) {
            setError(shareError.message);
        } finally {
            setSharing(false);
        }
    }

    if (loading) {
        return <div className="ph-bxh-page"><div className="ph-bxh-shell"><div className="ph-skeleton ph-skeleton--card" /><div className="ph-bxh-skeleton-row"><div className="ph-skeleton ph-skeleton--card" /><div className="ph-skeleton ph-skeleton--card" /><div className="ph-skeleton ph-skeleton--card" /></div><div className="ph-skeleton ph-skeleton--row" /><div className="ph-skeleton ph-skeleton--row" /></div></div>;
    }
    if (accessState === 'forbidden') {
        return <div className="ph-bxh-page"><div className="ph-bxh-shell"><section className="ph-state"><h1 className="ph-state__title">Không có quyền xem BXH</h1><p className="ph-state__text">Phiên CLB không hợp lệ hoặc đã hết hạn.</p><a className="ph-btn ph-btn--primary" href="/">Nhập lại mã CLB</a></section></div></div>;
    }
    if (error) {
        return <div className="ph-bxh-page"><div className="ph-bxh-shell"><section className="ph-state"><h1 className="ph-state__title">Chưa tải được BXH</h1><p className="ph-state__text">{error}</p><button className="ph-btn ph-btn--primary" type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></section></div></div>;
    }

    const rows = result.rows;
    const podium = rows.slice(0, 3);
    const scale = rows[0]?.amount || 1;
    const average = result.summary.memberCount > 0 ? Math.round(result.summary.totalAmount / result.summary.memberCount) : 0;
    const hasAside = result.idle.length > 0 || recent.length > 0;

    return (
        <div className="ph-bxh-page">
            <div className="ph-bxh-shell">
                <section className="ph-bxh-hero">
                    <span className="ph-bxh-hero__glow ph-bxh-hero__glow--a" aria-hidden="true" />
                    <span className="ph-bxh-hero__glow ph-bxh-hero__glow--b" aria-hidden="true" />
                    <div className="ph-bxh-hero__inner">
                        <div className="ph-bxh-hero__text">
                            <span className="ph-bxh-hero__tag"><span className="ph-bxh-hero__ping" aria-hidden="true" />Minh bạch và cùng tiến bộ</span>
                            <h1 className="ph-bxh-hero__title">BXH đóng góp quỹ</h1>
                            <p className="ph-bxh-hero__date"><span aria-hidden="true">📅</span>{periodText(result.period)}</p>
                            <p className="ph-bxh-hero__desc">Theo dõi tiến độ đóng góp quỹ sinh hoạt của CLB theo từng chu kỳ.</p>
                        </div>
                        <button className="ph-bxh-hero__share" type="button" onClick={shareBoard} disabled={sharing}>
                            <span aria-hidden="true">🔗</span>{sharing ? 'Đang tạo ảnh…' : 'Chia sẻ BXH'}
                        </button>
                    </div>
                </section>

                <div className="ph-bxh-controls"><PhSeg items={PERIODS} value={period} onChange={setPeriod} label="Chọn kỳ xem" /></div>

                {rows.length === 0 ? (
                    <section className="ph-panel"><div className="ph-state"><h2 className="ph-state__title">Chưa có đóng góp trong kỳ này</h2><p className="ph-state__text">Khi có thành viên đóng quỹ, bảng xếp hạng sẽ xuất hiện tại đây.</p></div></section>
                ) : (
                    <>
                        <section className="ph-bxh-kpi" aria-label="Tổng quan đóng góp">
                            <div className="ph-bxh-kpi__hero">
                                <div>
                                    <p className="ph-bxh-kpi__label"><span className="ph-bxh-kpi__dot" aria-hidden="true" />Tổng đóng góp quỹ</p>
                                    <p className="ph-bxh-kpi__value">{money.format(result.summary.totalAmount)}<span>đ</span></p>
                                </div>
                                <span className="ph-bxh-kpi__badge" aria-hidden="true">💰</span>
                            </div>
                            <div className="ph-bxh-kpi__small ph-bxh-kpi__small--gold">
                                <p className="ph-bxh-kpi__mini"><span aria-hidden="true">👥</span>Số người góp</p>
                                <p className="ph-bxh-kpi__mini-value">{result.summary.memberCount}<small>thành viên</small></p>
                            </div>
                            <div className="ph-bxh-kpi__small ph-bxh-kpi__small--cyan">
                                <p className="ph-bxh-kpi__mini"><span aria-hidden="true">📈</span>Số lượt góp</p>
                                <p className="ph-bxh-kpi__mini-value">{result.summary.transactionCount}<small>giao dịch</small></p>
                            </div>
                            <div className="ph-bxh-kpi__small ph-bxh-kpi__small--avg">
                                <p className="ph-bxh-kpi__mini"><span aria-hidden="true">⚖️</span>Trung bình / người</p>
                                <p className="ph-bxh-kpi__mini-value">{money.format(average)}<small>đ mỗi người</small></p>
                            </div>
                        </section>

                        <div className={`ph-bxh-columns${hasAside ? '' : ' ph-bxh-columns--single'}`}>
                            <div className="ph-bxh-main">
                                <section className="ph-bxh-podium" aria-label="Ba hạng đầu">
                                    <div className="ph-bxh-section-heading">
                                        <h2 className="ph-bxh-podium__heading"><span aria-hidden="true">🏆</span>Top đầu bảng</h2>
                                        <span className="ph-badge ph-badge--muted">Top {podium.length}</span>
                                    </div>
                                    <div className="ph-bxh-podium__grid">
                                        {podium.map((row) => (
                                            <article className={`ph-bxh-pod ph-bxh-pod--${row.rank}`} key={row.key}>
                                                <div className="ph-bxh-pod__left">
                                                    <span className="ph-bxh-pod__avatar" aria-hidden="true">{initials(row.name)}<span className="ph-bxh-pod__num">{row.rank}</span></span>
                                                    <div className="ph-bxh-pod__info">
                                                        <div className="ph-bxh-pod__meta"><span className="ph-bxh-pod__rank">Hạng {row.rank}</span><span className="ph-bxh-pod__count">{row.transactionCount} lượt góp</span></div>
                                                        <h3>{row.name}</h3>
                                                    </div>
                                                </div>
                                                <div className="ph-bxh-pod__right">
                                                    <strong>{amountText(row.amount)}</strong>
                                                    <span className="ph-bxh-pod__medal">{MEDALS[row.rank - 1]}</span>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                    {rows.length === 1 && <p className="ph-bxh-only">Người duy nhất góp quỹ kỳ này</p>}
                                </section>

                                {result.unassigned.count > 0 && <p className="ph-bxh-note">{amountText(result.unassigned.amount)} từ {result.unassigned.count} giao dịch chưa vào bảng. <a href="/admin?section=fund">Mở sổ quỹ để xử lý</a>.</p>}

                                <section className="ph-bxh-list-wrap" aria-label="Tất cả thứ hạng">
                                    <div className="ph-bxh-section-heading">
                                        <div><p className="ph-bxh-kicker">Xếp hạng theo tổng tiền</p><h2>Tất cả thứ hạng</h2></div>
                                        <span className="ph-badge ph-badge--muted">{rows.length} người</span>
                                    </div>
                                    <div className="ph-bxh-list">
                                        {rows.map((row) => {
                                            const multiple = row.rank === 1 && rows[1] && row.amount > rows[1].amount * 1.5;
                                            const width = Math.min(100, (row.amount / scale) * 100);
                                            return (
                                                <article className="ph-bxh-item" key={row.key}>
                                                    <div className="ph-bxh-item__top">
                                                        <div className="ph-bxh-person">
                                                            <span className="ph-bxh-avatar ph-bxh-avatar--small" aria-hidden="true">{initials(row.name)}</span>
                                                            <div className="ph-bxh-person__body">
                                                                <h4>{row.name}</h4>
                                                                <span className="ph-bxh-badges">
                                                                    {row.streak >= 2 && <span className="ph-badge">Chuỗi {row.streak}</span>}
                                                                    {row.badges.map((badge) => <span className="ph-badge ph-badge--gold" key={badge.kind}>{badge.label}</span>)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <span className="ph-bxh-item__rank">#{row.rank}</span>
                                                    </div>
                                                    <div className="ph-bxh-item__bottom">
                                                        <span className="ph-bxh-item__count">Lượt góp: <strong>{row.transactionCount}</strong></span>
                                                        <div className="ph-bxh-item__amount">
                                                            <strong>{amountText(row.amount)}</strong>
                                                            <div className="ph-bxh-bar"><span style={{ width: `${width}%` }} /></div>
                                                        </div>
                                                    </div>
                                                    {multiple && <small className="ph-bxh-item__multi">gấp {(row.amount / rows[1].amount).toFixed(1).replace('.', ',')} lần hạng 2</small>}
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            </div>

                            {hasAside && (
                                <aside className="ph-bxh-side" aria-label="Nhắc nhở và hoạt động">
                                    {result.idle.length > 0 && (
                                        <section className="ph-bxh-reminder" aria-label="Chưa góp quỹ kỳ này">
                                            <div className="ph-bxh-reminder__head">
                                                <span className="ph-bxh-reminder__icon" aria-hidden="true">🔔</span>
                                                <div><p className="ph-bxh-kicker ph-bxh-kicker--rose">Cần một lời nhắc nhẹ</p><h2>Chưa góp quỹ kỳ này</h2></div>
                                            </div>
                                            <ul className="ph-bxh-reminder__list">
                                                {result.idle.map((item) => (
                                                    <li key={item.name}>
                                                        <strong>{item.name}</strong>
                                                        <span>{item.description}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}

                                    {recent.length > 0 && (
                                        <section className="ph-bxh-recent" aria-label="Biến động gần đây">
                                            <div className="ph-bxh-section-heading"><h2>Biến động gần đây</h2></div>
                                            <ul className="ph-bxh-recent__list">
                                                {recent.map((item, index) => (
                                                    <li key={`${item.name}-${item.at.getTime()}-${index}`}>
                                                        <span className="ph-bxh-avatar ph-bxh-avatar--small" aria-hidden="true">{initials(item.name)}</span>
                                                        <div className="ph-bxh-recent__who">
                                                            <strong>{item.name}</strong>
                                                            <span>{date.format(item.at)}</span>
                                                        </div>
                                                        <span className="ph-bxh-recent__amount">+{amountText(item.amount)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                </aside>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
