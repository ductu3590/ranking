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
        return <main className="ph-bxh-page"><div className="ph-bxh-shell"><div className="ph-skeleton ph-skeleton--card" /><div className="ph-bxh-skeleton-row"><div className="ph-skeleton ph-skeleton--card" /><div className="ph-skeleton ph-skeleton--card" /><div className="ph-skeleton ph-skeleton--card" /></div><div className="ph-skeleton ph-skeleton--row" /><div className="ph-skeleton ph-skeleton--row" /></div></main>;
    }
    if (accessState === 'forbidden') {
        return <main className="ph-bxh-page"><div className="ph-bxh-shell"><section className="ph-state"><h1 className="ph-state__title">Không có quyền xem BXH</h1><p className="ph-state__text">Phiên CLB không hợp lệ hoặc đã hết hạn.</p><a className="ph-btn ph-btn--primary" href="/">Nhập lại mã CLB</a></section></div></main>;
    }
    if (error) {
        return <main className="ph-bxh-page"><div className="ph-bxh-shell"><section className="ph-state"><h1 className="ph-state__title">Chưa tải được BXH</h1><p className="ph-state__text">{error}</p><button className="ph-btn ph-btn--primary" type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></section></div></main>;
    }

    const rows = result.rows;
    const podium = rows.slice(0, 3);
    const scale = rows[1]?.amount || rows[0]?.amount || 1;

    return (
        <main className="ph-bxh-page">
            <div className="ph-bxh-shell">
                <header className="ph-bxh-header">
                    <div>
                        <p className="ph-bxh-kicker">Minh bạch và cùng tiến bộ</p>
                        <h1>BXH đóng góp</h1>
                        <p className="ph-bxh-period">{periodText(result.period)}</p>
                    </div>
                    <button className="ph-btn ph-btn--outline" type="button" onClick={shareBoard} disabled={sharing}>
                        {sharing ? 'Đang tạo ảnh...' : 'Chia sẻ BXH'}
                    </button>
                </header>

                <div className="ph-bxh-controls"><PhSeg items={PERIODS} value={period} onChange={setPeriod} label="Chọn kỳ xem" /></div>

                {rows.length === 0 ? (
                    <section className="ph-panel"><div className="ph-state"><h2 className="ph-state__title">Chưa có đóng góp trong kỳ này</h2><p className="ph-state__text">Khi có thành viên đóng quỹ, bảng xếp hạng sẽ xuất hiện tại đây.</p></div></section>
                ) : (
                    <>
                        <section className="ph-bxh-metrics" aria-label="Tổng quan đóng góp">
                            <div className="ph-metric ph-metric--indigo"><span className="ph-metric__label">Tổng đóng góp</span><strong className="ph-metric__value">{amountText(result.summary.totalAmount)}</strong></div>
                            <div className="ph-metric ph-metric--gold"><span className="ph-metric__label">Số người góp</span><strong className="ph-metric__value">{result.summary.memberCount}</strong></div>
                            <div className="ph-metric ph-metric--cyan"><span className="ph-metric__label">Số lượt góp</span><strong className="ph-metric__value">{result.summary.transactionCount}</strong></div>
                        </section>
                        <section className="ph-bxh-podium" aria-label="Ba hạng đầu">
                            {podium.map((row) => <article className={`ph-bxh-podium-card ph-bxh-podium-card--${row.rank}`} key={row.key}><span className="ph-bxh-rank">Hạng {row.rank}</span><span className="ph-bxh-avatar" aria-hidden="true">{initials(row.name)}</span><h2>{row.name}</h2><strong>{amountText(row.amount)}</strong><span>{row.transactionCount} lượt góp</span></article>)}
                            {rows.length === 1 && <p className="ph-bxh-only">Người duy nhất góp quỹ kỳ này</p>}
                        </section>
                        {result.unassigned.count > 0 && <p className="ph-bxh-note">{amountText(result.unassigned.amount)} từ {result.unassigned.count} giao dịch chưa vào bảng. <a href="/admin?section=fund">Mở sổ quỹ để xử lý</a>.</p>}
                        <section className="ph-card ph-card--flat ph-bxh-table-card">
                            <div className="ph-bxh-section-heading"><div><p className="ph-bxh-kicker">Xếp hạng theo tổng tiền</p><h2>Tất cả thứ hạng</h2></div><span className="ph-badge ph-badge--muted">{rows.length} người</span></div>
                            <table className="ph-table"><thead><tr><th>Hạng</th><th>Thành viên</th><th>Lượt góp</th><th>Tổng đóng góp</th></tr></thead><tbody>{rows.map((row) => { const multiple = row.rank === 1 && rows[1] && row.amount > rows[1].amount * 1.5; const width = Math.min(100, (row.amount / scale) * 100); return <tr key={row.key}><td data-label="Hạng"><strong>{row.rank}</strong></td><td data-label="Thành viên"><div className="ph-bxh-person"><span className="ph-bxh-avatar ph-bxh-avatar--small" aria-hidden="true">{initials(row.name)}</span><span><strong>{row.name}</strong><span className="ph-bxh-badges">{row.streak >= 2 && <span className="ph-badge">Chuỗi {row.streak}</span>}{row.badges.map((badge) => <span className="ph-badge ph-badge--gold" key={badge.kind}>{badge.label}</span>)}</span></span></div></td><td data-label="Lượt góp">{row.transactionCount}</td><td data-label="Tổng đóng góp"><strong>{amountText(row.amount)}</strong><div className="ph-bxh-bar"><span style={{ width: `${width}%` }} /></div>{multiple && <small>gấp {(row.amount / rows[1].amount).toFixed(1).replace('.', ',')} lần hạng 2</small>}</td></tr>; })}</tbody></table>
                        </section>
                        {result.idle.length > 0 && <section className="ph-card ph-card--flat ph-bxh-idle"><div className="ph-bxh-section-heading"><div><p className="ph-bxh-kicker">Cần một lời nhắc nhẹ</p><h2>Chưa góp quỹ kỳ này</h2></div></div><ul>{result.idle.map((item) => <li key={item.name}><strong>{item.name}</strong><span>{item.description}</span></li>)}</ul></section>}
                    </>
                )}
            </div>
        </main>
    );
}
