'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CalendarIcon, Chip, PinIcon, ProgressBar } from '../../CommunityUi';
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

    return (
        <div className="cd-wide">
            <section className="cd-hero" aria-labelledby="cd-tournament-title">
                <h1 id="cd-tournament-title" className="cd-title">{tournament.name}</h1>
                <ul className="cd-meta cd-meta--row">
                    {tournament.location ? <li><PinIcon /> {tournament.location}</li> : null}
                    {tournament.eventDate ? <li><CalendarIcon /> {formatDate(tournament.eventDate, { withWeekday: true })}{tournament.startTime ? `, ${tournament.startTime}` : ''}</li> : null}
                    {active ? <li>Lệ phí {formatVnd(active.entryFee)}{Number(active.entryFee) > 0 ? '/cặp' : ''}</li> : null}
                    {active?.deadline ? <li>Hạn đăng ký {formatDate(active.deadline)}</li> : null}
                </ul>
            </section>

            {divisions.length === 0 ? <div className="cd-empty"><p>Giải chưa có nội dung thi đấu nào.</p></div> : (
                <div className="cd-split">
                    <section className="cd-card cd-card--flat" aria-label="Danh sách cặp đã duyệt">
                        <div className="cd-tabs cd-tabs--scroll" role="tablist" aria-label="Nội dung thi đấu">
                            {divisions.map((d) => (
                                <button key={d.id} type="button" role="tab" className="cd-tab" aria-selected={active.id === d.id}
                                    onClick={() => { setActiveId(d.id); setShowAll(false); }}>
                                    {d.name} · {d.summary.approved}{d.summary.capacity != null ? `/${d.summary.capacity}` : ''}
                                </button>
                            ))}
                        </div>
                        <ProgressBar
                            value={active.summary.approved}
                            max={active.summary.capacity || active.summary.approved || 1}
                            label={active.summary.capacity != null ? `${active.summary.approved}/${active.summary.capacity} cặp đã duyệt` : `${active.summary.approved} cặp đã duyệt`}
                        />
                        <p className="cd-muted">Danh sách chỉ hiện các cặp đã được ban tổ chức duyệt</p>
                        {pairs.length === 0 ? <p className="cd-empty">Chưa có cặp nào được duyệt.</p> : (
                            <ul className="cd-pairs">
                                {pairs.map((pair) => <li key={pair.key}>{pair.pairLabel}</li>)}
                            </ul>
                        )}
                        {hidden > 0 ? <button type="button" className="cd-btn cd-btn--ghost" onClick={() => setShowAll(true)}>Xem thêm {hidden} cặp</button> : null}
                    </section>

                    <aside className="cd-card cd-sticky" aria-label="Đăng ký tham gia">
                        <h2 className="cd-subtitle">Đăng ký tham gia</h2>
                        <p className="cd-lead">{active.name}</p>
                        {active.summary.capacity != null
                            ? <Chip tone={active.summary.full ? 'warn' : 'ok'}>{active.summary.full ? 'Đã đủ · nhận danh sách chờ' : `Còn ${active.summary.remaining} suất`}</Chip>
                            : null}
                        {canRegister
                            ? <Link className="cd-btn cd-btn--primary cd-btn--block" href={registerHref}>{active.summary.full ? 'Đăng ký vào danh sách chờ' : 'Đăng ký tham gia'}</Link>
                            : <p className="cd-note" data-tone="warn">{closedText}</p>}
                        <p className="cd-legal">Cần tài khoản VĐV PickHub để đăng ký</p>
                    </aside>
                </div>
            )}

            {canRegister ? (
                <div className="cd-stickybar" role="region" aria-label="Đăng ký nhanh">
                    <span className="cd-stickybar__text">{active.summary.capacity != null ? (active.summary.full ? 'Đã đủ · danh sách chờ' : `Còn ${active.summary.remaining} suất`) : 'Đang nhận đăng ký'}</span>
                    <Link className="cd-btn cd-btn--primary" href={registerHref}>Đăng ký tham gia</Link>
                </div>
            ) : null}
        </div>
    );
}
