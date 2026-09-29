'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ArrowIcon, CalendarIcon, CardIcon, ChevronDownIcon, Chip, ClockIcon, PinIcon } from '../../CommunityUi';
import { api, errorText, formatDate, formatVnd } from '../../communityClient';

const CLOSED_REASONS = {
    TOURNAMENT_CLOSED: 'Giải đã đóng đăng ký.',
    DIVISION_CLOSED: 'Nội dung này đã đóng đăng ký.',
    DEADLINE_PASSED: 'Đã hết hạn đăng ký.',
    NOT_COMMUNITY: 'Giải này không nhận đăng ký công khai.',
};

export default function PublicTournamentClient({ slug }) {
    const [state, setState] = useState({ loading: true, error: '', data: null });
    const [activeId, setActiveId] = useState(null);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        let alive = true;
        api(`/api/tournament-v2/public/community/${encodeURIComponent(slug)}/pairs`).then((result) => {
            if (!alive) return;
            if (!result.ok) {
                setState({ loading: false, error: errorText(result, 'Không tìm thấy giải.'), data: null });
                return;
            }
            setState({ loading: false, error: '', data: result.data });
            const wanted = Number(new URLSearchParams(window.location.search).get('d'));
            const first = result.data.divisions.find((d) => d.id === wanted) || result.data.divisions[0];
            setActiveId(first ? first.id : null);
        });
        return () => { alive = false; };
    }, [slug]);

    if (state.loading) return <div className="cd-wide"><p className="cd-lead" aria-busy="true">Đang tải giải…</p></div>;
    if (state.error) {
        return (
            <div className="cd-wide">
                <p className="cd-alert" role="alert">{state.error}</p>
                <Link className="cd-btn cd-btn--ghost" href="/cong-dong">Xem các giải đang mở</Link>
            </div>
        );
    }

    const { tournament, divisions } = state.data;
    const active = divisions.find((d) => d.id === activeId) || divisions[0];
    const registerHref = active ? `/cong-dong/giai/${tournament.slug}/dang-ky?d=${active.id}` : null;
    const canRegister = !!active && active.open.ok;
    const pairs = active ? (showAll ? active.pairs : active.pairs.slice(0, 8)) : [];
    const hidden = active ? active.pairs.length - pairs.length : 0;
    const closedText = tournament.locked ? 'Giải đã chốt danh sách.' : (CLOSED_REASONS[active?.open.reason] || 'Nội dung này chưa nhận đăng ký.');

    const capacityText = active && active.summary.capacity != null ? `${active.summary.approved}/${active.summary.capacity} cặp đã duyệt` : `${active?.summary.approved ?? 0} cặp đã duyệt`;
    const percent = active && active.summary.capacity ? Math.min(100, Math.round((active.summary.approved / active.summary.capacity) * 100)) : 0;
    const slotChip = active && active.summary.capacity != null
        ? <Chip tone={active.summary.full ? 'warn' : 'ok'}>{active.summary.full ? 'Đã đủ · nhận danh sách chờ' : `Còn ${active.summary.remaining} suất`}</Chip>
        : null;
    const ctaLabel = active?.summary.full ? 'Đăng ký vào danh sách chờ' : 'Đăng ký tham gia';
    const tabs = (
        <div className="cd-pilltabs" role="tablist" aria-label="Nội dung thi đấu">
            {divisions.map((d) => (
                <button key={d.id} type="button" role="tab" className="cd-pilltab" aria-selected={active.id === d.id}
                    onClick={() => { setActiveId(d.id); setShowAll(false); }}>
                    {d.name}<i aria-hidden="true">·</i>{d.summary.approved}{d.summary.capacity != null ? `/${d.summary.capacity}` : ''}
                </button>
            ))}
        </div>
    );

    return (
        <div className="cd-wide cd-public">
            <section className="cd-band" aria-labelledby="cd-tournament-title">
                <div className="cd-band__inner">
                    <h1 id="cd-tournament-title" className="cd-title cd-title--lg">{tournament.name}</h1>
                    <ul className="cd-meta cd-meta--row cd-meta--lg">
                        {tournament.location ? <li><PinIcon /> {tournament.location}</li> : null}
                        {tournament.eventDate ? <li><CalendarIcon /> {formatDate(tournament.eventDate, { withWeekday: true })}{tournament.startTime ? ` ${tournament.startTime}` : ''}</li> : null}
                        {active ? <li data-strong><CardIcon /> Lệ phí {formatVnd(active.entryFee)}{Number(active.entryFee) > 0 ? '/cặp' : ''}</li> : null}
                        {active?.deadline ? <li><ClockIcon /> Hạn đăng ký {formatDate(active.deadline)}</li> : null}
                    </ul>
                </div>
            </section>

            {divisions.length === 0 ? <div className="cd-empty"><p>Giải chưa có nội dung thi đấu nào.</p></div> : (
                <div className="cd-split cd-split--public">
                    <div className="cd-public__main">
                        <div className="cd-show-sm cd-tabs-out">{tabs}</div>
                        <section className="cd-card cd-card--flat cd-listcard" aria-label="Danh sách cặp đã duyệt">
                            <div className="cd-hide-sm cd-tabs-in">{tabs}</div>
                            <div className="cd-capacity">
                                <div className="cd-capacity__row cd-capacity__row--lead">
                                    <b>{capacityText}</b>
                                    {active.summary.capacity != null ? <span className="cd-percent">{percent}%</span> : null}
                                </div>
                                <div className="cd-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={active.summary.capacity || active.summary.approved || 1} aria-valuenow={active.summary.approved} aria-label={capacityText}>
                                    <span style={{ width: `${percent}%` }} />
                                </div>
                                <p className="cd-hint">Danh sách chỉ hiện các cặp đã được ban tổ chức duyệt</p>
                            </div>
                            {pairs.length === 0 ? <p className="cd-empty">Chưa có cặp nào được duyệt.</p> : (
                                <ul className="cd-pairlist">
                                    {pairs.map((pair, index) => (
                                        <li key={pair.key}>
                                            <span className="cd-pairlist__no" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                                            <span className="cd-pairlist__name">{pair.pairLabel}</span>
                                            <span className="cd-approved">Đã duyệt</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {hidden > 0 ? <button type="button" className="cd-btn cd-btn--ghost cd-btn--block" onClick={() => setShowAll(true)}>Xem thêm {hidden} cặp <ChevronDownIcon /></button> : null}
                        </section>
                    </div>

                    <aside className="cd-card cd-sticky cd-hide-sm cd-registercard" aria-label="Đăng ký tham gia">
                        <h2 className="cd-subtitle cd-subtitle--md">Đăng ký tham gia</h2>
                        <div className="cd-selected">
                            <div className="cd-selected__head"><span>Nội dung đang chọn</span>{slotChip}</div>
                            <b>{active.name}</b>
                            <span className="cd-selected__meta">{capacityText}{Number(active.entryFee) > 0 ? ` · Lệ phí ${formatVnd(active.entryFee)}/cặp` : ' · Miễn phí'}</span>
                        </div>
                        {canRegister
                            ? <Link className="cd-btn cd-btn--cta cd-btn--primary cd-btn--block" href={registerHref}>{ctaLabel} <ArrowIcon /></Link>
                            : <p className="cd-note" data-tone="warn">{closedText}</p>}
                        <p className="cd-legal">Cần tài khoản VĐV PickHub để đăng ký</p>
                    </aside>
                </div>
            )}

            {canRegister ? (
                <div className="cd-stickybar cd-stickybar--panel" role="region" aria-label="Đăng ký nhanh">
                    <div className="cd-stickybar__row">
                        <div className="cd-stickybar__label"><small>Nội dung đang chọn</small><b>{active.name}</b></div>
                        {slotChip}
                    </div>
                    <Link className="cd-btn cd-btn--cta cd-btn--primary cd-btn--block" href={registerHref}>{ctaLabel} <ArrowIcon /></Link>
                    <p className="cd-legal">Cần tài khoản VĐV PickHub để đăng ký</p>
                </div>
            ) : null}
        </div>
    );
}
