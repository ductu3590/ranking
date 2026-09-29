'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { CalendarIcon, ChevronIcon, Chip, PinIcon, SearchIcon } from './CommunityUi';
import { api, errorText, formatDate, formatVnd } from './communityClient';

const FILTERS = [
    { key: 'all', label: 'Tất cả' },
    { key: 'week', label: 'Tuần này' },
    { key: 'month', label: 'Tháng này' },
];

function todayIso() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function inRange(eventDate, filter) {
    if (filter === 'all') return true;
    if (!eventDate) return false;
    const today = new Date(`${todayIso()}T00:00:00`);
    const date = new Date(`${eventDate}T00:00:00`);
    const days = Math.round((date - today) / 86400000);
    if (filter === 'week') return days >= 0 && days < 7;
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

// Tổng hợp thẻ giải từ danh sách nội dung: số cặp đã duyệt / hạn mức, mức phí, hạn đăng ký gần nhất.
function summarize(tournament) {
    const divisions = tournament.divisions || [];
    const approved = divisions.reduce((sum, d) => sum + (d.approved_count || 0), 0);
    const capacities = divisions.map((d) => d.registration_capacity);
    const capacity = capacities.every((c) => c != null) ? capacities.reduce((sum, c) => sum + c, 0) : null;
    const fees = divisions.map((d) => Number(d.entry_fee) || 0);
    const minFee = Math.min(...fees);
    const maxFee = Math.max(...fees);
    const deadlines = divisions.map((d) => d.registration_deadline).filter(Boolean).sort();
    const full = divisions.length > 0 && divisions.every((d) => d.registration_capacity != null && (d.approved_count || 0) >= d.registration_capacity);
    return { approved, capacity, minFee, maxFee, deadline: deadlines[0] || null, full };
}

// Chỉ phần giá trị (nhãn "Lệ phí" nằm ở dòng nhỏ phía trên, đúng thiết kế PLC-01).
function feeValue({ minFee, maxFee }) {
    if (maxFee <= 0) return null;
    return minFee === maxFee ? `${formatVnd(maxFee)}/cặp` : `Từ ${formatVnd(minFee)}/cặp`;
}

export default function TournamentListClient() {
    const [state, setState] = useState({ loading: true, error: '', tournaments: [] });
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        let alive = true;
        api('/api/tournament-v2/public/community').then((result) => {
            if (!alive) return;
            if (!result.ok) setState({ loading: false, error: errorText(result, 'Không tải được danh sách giải.'), tournaments: [] });
            else setState({ loading: false, error: '', tournaments: result.data.tournaments || [] });
        });
        return () => { alive = false; };
    }, []);

    const visible = useMemo(() => {
        const text = query.trim().toLowerCase();
        return state.tournaments.filter((t) => inRange(t.event_date, filter)
            && (!text || `${t.name} ${t.location || ''}`.toLowerCase().includes(text)));
    }, [state.tournaments, query, filter]);

    return (
        <div className="cd-wide cd-list">
            <header className="cd-pagehead">
                <span className="cd-eyebrow"><i aria-hidden="true" />Đang mở đăng ký</span>
                <h1 className="cd-title cd-title--xl">Giải cộng đồng đang mở đăng ký</h1>
                <p className="cd-lead">Chọn một giải, tạo tài khoản và đăng ký cùng bạn ghép cặp</p>
            </header>

            <div className="cd-filterbar">
                <label className="cd-search">
                    <span className="cd-sr">Tìm giải theo tên hoặc địa điểm</span>
                    <SearchIcon />
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm giải theo tên hoặc địa điểm" />
                </label>
                <div className="cd-chips" role="group" aria-label="Lọc theo thời gian">
                    {FILTERS.map((item) => (
                        <button key={item.key} type="button" className="cd-filterchip" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {state.loading ? <p className="cd-lead" aria-busy="true">Đang tải danh sách giải…</p> : null}
            {state.error ? <p className="cd-alert" role="alert">{state.error}</p> : null}
            {!state.loading && !state.error && visible.length === 0 ? (
                <div className="cd-empty">
                    <p>Chưa có giải nào đang mở đăng ký. Hãy quay lại sau.</p>
                </div>
            ) : null}

            <div className="cd-grid">
                {visible.map((tournament) => {
                    const info = summarize(tournament);
                    const fee = feeValue(info);
                    const percent = info.capacity ? Math.min(100, Math.round((info.approved / info.capacity) * 100)) : 0;
                    return (
                        <article className="cd-tcard cd-tcard--stitch" key={tournament.id}>
                            <div className="cd-tcard__top">
                                <div className="cd-divchips">
                                    {(tournament.divisions || []).map((d) => <span key={d.id} className="cd-divchip">{d.name}</span>)}
                                </div>
                                {info.full ? <Chip tone="warn">Đã đủ · nhận danh sách chờ</Chip> : (!fee ? <Chip tone="ok">Miễn phí</Chip> : null)}
                            </div>
                            <h2 className="cd-tcard__title">{tournament.name}</h2>
                            <ul className="cd-meta">
                                {tournament.location ? <li><PinIcon /> {tournament.location}</li> : null}
                                {tournament.event_date ? <li><CalendarIcon /> {formatDate(tournament.event_date, { withWeekday: true })}</li> : null}
                            </ul>
                            <div className="cd-capacity" data-full={info.full || undefined}>
                                <div className="cd-capacity__row">
                                    <span>Số lượng đăng ký</span>
                                    <b>{info.capacity != null ? `${info.approved}/${info.capacity} cặp đã duyệt` : `${info.approved} cặp đã duyệt`}</b>
                                </div>
                                {info.capacity != null ? (
                                    <div className="cd-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={info.capacity} aria-valuenow={info.approved} aria-label={`${info.approved}/${info.capacity} cặp đã duyệt`}>
                                        <span style={{ width: `${percent}%` }} />
                                    </div>
                                ) : null}
                            </div>
                            <div className="cd-feeline">
                                <div>
                                    <small>Lệ phí</small>
                                    <b data-free={!fee || undefined}>{fee || 'Miễn phí'}</b>
                                </div>
                                {info.deadline ? <div className="cd-feeline__end"><small>Hạn đăng ký</small><span>{formatDate(info.deadline)}</span></div> : null}
                            </div>
                            <Link className={`cd-btn cd-btn--cta cd-btn--block ${info.full ? 'cd-btn--outline' : 'cd-btn--primary'}`} href={`/cong-dong/giai/${tournament.public_slug}`}>
                                Xem giải &amp; đăng ký <ChevronIcon />
                            </Link>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
