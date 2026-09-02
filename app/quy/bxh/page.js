'use client';

import { useEffect, useMemo, useState } from 'react';
import leaderboardUtils from '@/lib/fundLeaderboard';
import './page.css';

const {
    buildPenaltyLeaderboard,
    getPenaltyPeriodBounds,
    summarizePenaltyLeaderboard,
} = leaderboardUtils;

const PERIODS = [
    { key: 'week', label: 'Tuần này', icon: '📅' },
    { key: 'month', label: 'Tháng này', icon: '🗓️' },
];

const MEDALS = ['🥇', '🥈', '🥉'];
const moneyFormatter = new Intl.NumberFormat('vi-VN');
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function FundLeaderboardPage() {
    const [activePeriod, setActivePeriod] = useState('week');
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [referenceTime, setReferenceTime] = useState(() => new Date());

    useEffect(() => {
        const controller = new AbortController();

        async function loadTransactions() {
            setLoading(true);
            setError('');

            try {
                const response = await fetch('/api/club/transactions', { signal: controller.signal });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Không thể tải dữ liệu giao dịch.');
                setTransactions(data.transactions || []);
                setReferenceTime(new Date());
            } catch (loadError) {
                if (loadError.name !== 'AbortError') {
                    setError(loadError.message || 'Không thể tải bảng xếp hạng.');
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        loadTransactions();
        return () => controller.abort();
    }, [refreshKey]);

    const leaderboard = useMemo(
        () => buildPenaltyLeaderboard(transactions, activePeriod, referenceTime),
        [transactions, activePeriod, referenceTime]
    );
    const summary = useMemo(() => summarizePenaltyLeaderboard(leaderboard), [leaderboard]);
    const periodBounds = getPenaltyPeriodBounds(activePeriod, referenceTime);
    const podium = leaderboard.slice(0, 3);
    const remainingRanks = leaderboard.slice(3);

    return (
        <main className="leaderboard-page">
            <section className="leaderboard-hero">
                <div className="leaderboard-hero-copy">
                    <span className="leaderboard-eyebrow">Bảng vàng đóng góp</span>
                    <h1><span aria-hidden="true">🥇</span> BXH nộp phạt</h1>
                    <p>Vinh danh những thành viên đóng góp quỹ nhiều nhất qua các khoản nộp phạt.</p>
                </div>
                <div className="leaderboard-period-note">
                    <span>Kỳ đang xem</span>
                    <strong>{dateFormatter.format(periodBounds.start)} – nay</strong>
                </div>
            </section>

            <section className="leaderboard-toolbar" aria-label="Bộ lọc thời gian">
                <div className="leaderboard-tabs" role="tablist" aria-label="Thời gian xếp hạng">
                    {PERIODS.map((period) => (
                        <button
                            key={period.key}
                            type="button"
                            role="tab"
                            aria-selected={activePeriod === period.key}
                            className={activePeriod === period.key ? 'active' : ''}
                            onClick={() => setActivePeriod(period.key)}
                        >
                            <span aria-hidden="true">{period.icon}</span>
                            {period.label}
                        </button>
                    ))}
                </div>
            </section>

            {loading ? (
                <section className="leaderboard-state" aria-live="polite">
                    <span className="leaderboard-loader" aria-hidden="true" />
                    <h2>Đang tổng hợp bảng xếp hạng</h2>
                    <p>Dữ liệu nộp phạt đang được cập nhật...</p>
                </section>
            ) : error ? (
                <section className="leaderboard-state leaderboard-error" role="alert">
                    <span className="leaderboard-state-icon" aria-hidden="true">⚠️</span>
                    <h2>Chưa tải được BXH</h2>
                    <p>{error}</p>
                    <button type="button" onClick={() => setRefreshKey((key) => key + 1)}>Thử lại</button>
                </section>
            ) : leaderboard.length === 0 ? (
                <section className="leaderboard-state leaderboard-empty">
                    <span className="leaderboard-state-icon" aria-hidden="true">🏓</span>
                    <h2>Chưa có ai trên bảng vàng</h2>
                    <p>Chưa ghi nhận khoản nộp phạt nào trong {activePeriod === 'week' ? 'tuần này' : 'tháng này'}.</p>
                </section>
            ) : (
                <>
                    <section className="leaderboard-summary" aria-label="Tổng quan bảng xếp hạng">
                        <article>
                            <span className="summary-icon summary-icon-money" aria-hidden="true">💸</span>
                            <div>
                                <span>Tổng tiền phạt</span>
                                <strong>{moneyFormatter.format(summary.totalAmount)}đ</strong>
                            </div>
                        </article>
                        <article>
                            <span className="summary-icon summary-icon-people" aria-hidden="true">👥</span>
                            <div>
                                <span>Thành viên góp quỹ</span>
                                <strong>{summary.memberCount} người</strong>
                            </div>
                        </article>
                        <article>
                            <span className="summary-icon summary-icon-turns" aria-hidden="true">🎯</span>
                            <div>
                                <span>Số lượt nộp phạt</span>
                                <strong>{summary.transactionCount} lượt</strong>
                            </div>
                        </article>
                    </section>

                    <section className="leaderboard-podium" aria-label="Ba thành viên dẫn đầu">
                        {podium.map((entry) => {
                            const lastName = entry.name.trim().split(/\s+/).pop();
                            return (
                                <article key={entry.name} className={`podium-card podium-rank-${entry.rank}`}>
                                    <span className="podium-medal" aria-label={`Hạng ${entry.rank}`}>{MEDALS[entry.rank - 1]}</span>
                                    <div className="podium-avatar" aria-hidden="true">{lastName.charAt(0).toLocaleUpperCase('vi-VN')}</div>
                                    <h2>{entry.name}</h2>
                                    <strong className="podium-amount">{moneyFormatter.format(entry.amount)}đ</strong>
                                    <span className="podium-count">{entry.transactionCount} lượt nộp phạt</span>
                                </article>
                            );
                        })}
                    </section>

                    {remainingRanks.length > 0 && (
                        <section className="leaderboard-list-section">
                            <div className="leaderboard-list-heading">
                                <div>
                                    <span className="leaderboard-list-eyebrow">Bảng xếp hạng</span>
                                    <h2>Các thành viên tiếp theo</h2>
                                </div>
                                <span>{leaderboard.length} thành viên</span>
                            </div>
                            <ol className="leaderboard-list" start="4">
                                {remainingRanks.map((entry) => {
                                    const lastName = entry.name.trim().split(/\s+/).pop();
                                    return (
                                        <li key={entry.name}>
                                            <span className="list-rank">{entry.rank}</span>
                                            <span className="list-avatar" aria-hidden="true">{lastName.charAt(0).toLocaleUpperCase('vi-VN')}</span>
                                            <span className="list-person">
                                                <strong>{entry.name}</strong>
                                                <small>{entry.transactionCount} lượt nộp phạt</small>
                                            </span>
                                            <strong className="list-amount">{moneyFormatter.format(entry.amount)}đ</strong>
                                        </li>
                                    );
                                })}
                            </ol>
                        </section>
                    )}
                </>
            )}
        </main>
    );
}
