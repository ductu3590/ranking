'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ArrowIcon, CalendarIcon, ClockIcon, Notice, PinIcon, UserIcon } from '../../../CommunityUi';
import { api, errorText, formatDate, formatVnd, loginUrl } from '../../../communityClient';

const PROFILE_CODES = ['COMMUNITY_GENDER_REQUIRED', 'COMMUNITY_DOB_REQUIRED', 'COMMUNITY_PHR_REQUIRED'];
const GENDER_LABEL = { male: 'Nam', female: 'Nữ' };

export default function RegisterClient({ slug }) {
    const router = useRouter();
    const [state, setState] = useState({ loading: true, error: '', account: null, tournament: null, divisions: [] });
    const [divisionId, setDivisionId] = useState(null);
    const [partnerMode, setPartnerMode] = useState('have');
    const [partnerPhone, setPartnerPhone] = useState('');
    const [company, setCompany] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState({ text: '', code: '' });

    useEffect(() => {
        let alive = true;
        (async () => {
            const query = new URLSearchParams(window.location.search).get('d');
            const back = `/cong-dong/giai/${slug}/dang-ky${query ? `?d=${encodeURIComponent(query)}` : ''}`;
            const [session, tournament] = await Promise.all([
                api('/api/player/session'),
                api(`/api/tournament-v2/public/community/${encodeURIComponent(slug)}/pairs`),
            ]);
            if (!alive) return;
            if (!session.data?.account) { router.replace(loginUrl(back)); return; }
            if (!tournament.ok) { setState({ loading: false, error: errorText(tournament, 'Không tìm thấy giải.'), account: session.data.account, tournament: null, divisions: [] }); return; }
            const open = tournament.data.divisions.filter((d) => d.open.ok);
            setState({ loading: false, error: '', account: session.data.account, tournament: tournament.data.tournament, divisions: tournament.data.divisions });
            const wanted = Number(query);
            setDivisionId((open.find((d) => d.id === wanted) || open[0] || {}).id ?? null);
        })();
        return () => { alive = false; };
    }, [slug, router]);

    if (state.loading) return <div className="cd-wide"><p className="cd-lead" aria-busy="true">Đang tải…</p></div>;
    if (state.error) {
        return (
            <div className="cd-wide">
                <p className="cd-alert" role="alert">{state.error}</p>
                <Link className="cd-btn cd-btn--ghost" href="/cong-dong">Xem các giải đang mở</Link>
            </div>
        );
    }

    const { account, tournament, divisions } = state;
    const openDivisions = divisions.filter((d) => d.open.ok);
    const division = divisions.find((d) => d.id === divisionId);
    const isPair = division?.entrantType === 'pair';
    const fee = Number(division?.entryFee) || 0;
    const summary = division?.summary;
    const percent = summary && summary.capacity ? Math.min(100, Math.round((summary.approved / summary.capacity) * 100)) : 0;

    async function submit(event) {
        event.preventDefault();
        if (busy || !division) return;
        setBusy(true);
        setError({ text: '', code: '' });
        const result = await api('/api/tournament-v2/community/registrations', {
            method: 'POST',
            body: { divisionId: division.id, partnerMode: isPair ? partnerMode : undefined, partnerPhone: isPair && partnerMode === 'have' ? partnerPhone : undefined, company },
        });
        if (result.status === 401) { router.replace(loginUrl(`/cong-dong/giai/${slug}/dang-ky?d=${division.id}`)); return; }
        if (!result.ok) {
            setError({ text: errorText(result), code: result.data?.code || '' });
            setBusy(false);
            return;
        }
        router.replace(result.data.status === 'awaiting_partner'
            ? `/cong-dong/don-cua-toi/${result.data.registrationId}/ghep`
            : '/cong-dong/don-cua-toi');
    }

    return (
        <div className="cd-wide cd-register">
            <div className="cd-split cd-split--register">
                <aside className="cd-card cd-sticky cd-tourinfo" aria-label="Tóm tắt giải">
                    <span className="cd-eyebrow-text">Thông tin giải đấu</span>
                    <h2 className="cd-tourinfo__title">{tournament.name}</h2>
                    <ul className="cd-meta cd-meta--lg cd-tourinfo__meta">
                        {tournament.location ? <li><PinIcon /> {tournament.location}</li> : null}
                        {tournament.eventDate ? <li><CalendarIcon /> {formatDate(tournament.eventDate, { withWeekday: true })}</li> : null}
                        {division?.deadline ? <li><ClockIcon /> Hạn đăng ký: <b>{formatDate(division.deadline)}</b></li> : null}
                    </ul>
                    {summary?.capacity != null ? (
                        <div className="cd-progressbox">
                            <div className="cd-capacity__row"><span>Tiến độ đăng ký</span><b className="cd-brandtext">{summary.approved}/{summary.capacity} cặp đã duyệt</b></div>
                            <div className="cd-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={summary.capacity} aria-valuenow={summary.approved} aria-label={`${summary.approved}/${summary.capacity} cặp đã duyệt`}>
                                <span style={{ width: `${percent}%` }} />
                            </div>
                            <small>{summary.full ? 'Đã đủ suất chính thức · nhận danh sách chờ' : `Còn ${summary.remaining} suất đăng ký chính thức`}</small>
                        </div>
                    ) : null}
                </aside>

                <form className="cd-formstack" onSubmit={submit}>
                    <h1 className="cd-title cd-title--lg">Đăng ký tham gia</h1>
                    {error.text ? (
                        <p className="cd-alert" role="alert">
                            {error.text}{' '}
                            {PROFILE_CODES.includes(error.code) ? <Link href="/cong-dong/tai-khoan/ho-so">Sửa hồ sơ</Link> : null}
                        </p>
                    ) : null}

                    <section className="cd-card cd-formcard" role="radiogroup" aria-labelledby="cd-division-title">
                        <h3 id="cd-division-title" className="cd-formcard__title">Chọn nội dung</h3>
                        {divisions.map((d) => (
                            <label key={d.id} className="cd-choice cd-choice--split" data-active={divisionId === d.id} data-disabled={!d.open.ok}>
                                <input type="radio" name="division" value={d.id} checked={divisionId === d.id} disabled={!d.open.ok}
                                    onChange={() => setDivisionId(d.id)} />
                                <span className="cd-choice__body">
                                    <strong>{d.name}</strong>
                                    <span className="cd-muted">
                                        {d.summary.capacity != null ? `${d.summary.approved}/${d.summary.capacity} cặp đã duyệt` : `${d.summary.approved} cặp đã duyệt`}
                                        {!d.open.ok ? ' · Đã đóng đăng ký' : ''}
                                    </span>
                                </span>
                                <span className="cd-choice__price">{formatVnd(d.entryFee)}{Number(d.entryFee) > 0 ? '/cặp' : ''}</span>
                            </label>
                        ))}
                    </section>

                    <section className="cd-card cd-formcard" aria-labelledby="cd-profile-title">
                        <div className="cd-formcard__head">
                            <h3 id="cd-profile-title" className="cd-formcard__title">Hồ sơ của bạn</h3>
                            <Link className="cd-link cd-link--sm" href="/cong-dong/tai-khoan/ho-so">Sửa hồ sơ</Link>
                        </div>
                        <div className="cd-profilebox">
                            <span className="cd-profilebox__name"><UserIcon /> <b>{account.displayName}</b></span>
                            {account.gender ? <span className="cd-profilebox__item"><i aria-hidden="true" />Giới tính: <b>{GENDER_LABEL[account.gender]}</b></span> : null}
                            {account.selfDeclaredPhr != null ? <span className="cd-profilebox__item"><i aria-hidden="true" />Trình độ: <em className="cd-phr">PHR {account.selfDeclaredPhr}</em></span> : null}
                        </div>
                    </section>

                    {isPair ? (
                        <section className="cd-card cd-formcard" role="radiogroup" aria-labelledby="cd-partner-title">
                            <h3 id="cd-partner-title" className="cd-formcard__title">Bạn ghép cặp</h3>
                            <div className="cd-choice cd-choice--group" data-active={partnerMode === 'have'}>
                                <label className="cd-choice__row">
                                    <input type="radio" name="partner" checked={partnerMode === 'have'} onChange={() => setPartnerMode('have')} />
                                    <strong>Tôi đã có bạn ghép</strong>
                                </label>
                                {partnerMode === 'have' ? (
                                    <div className="cd-field cd-field--nested">
                                        <label htmlFor="cd-partner-phone">Số điện thoại của bạn ghép</label>
                                        <input id="cd-partner-phone" type="tel" inputMode="tel" placeholder="Nhập số điện thoại VĐV ghép" value={partnerPhone} onChange={(e) => setPartnerPhone(e.target.value)} required />
                                        <p className="cd-hint">Bạn ghép cần có tài khoản VĐV PickHub. Hệ thống sẽ gửi lời mời cho bạn ấy.</p>
                                    </div>
                                ) : null}
                            </div>
                            <label className="cd-choice" data-active={partnerMode === 'need'}>
                                <input type="radio" name="partner" checked={partnerMode === 'need'} onChange={() => setPartnerMode('need')} />
                                <span className="cd-choice__body">
                                    <strong>Tôi cần tìm bạn ghép</strong>
                                    <span className="cd-muted">Đơn của bạn ở trạng thái Chờ bạn ghép cho tới khi có người nhận lời</span>
                                </span>
                            </label>
                        </section>
                    ) : null}

                    {fee > 0 ? <Notice tone="warn" icon>Lệ phí {formatVnd(fee)}/cặp thu ngoài hệ thống. Ban tổ chức sẽ liên hệ qua số điện thoại của bạn.</Notice> : null}

                    <div className="cd-honeypot" aria-hidden="true">
                        <label htmlFor="cd-reg-company">Công ty</label>
                        <input id="cd-reg-company" name="company" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
                    </div>

                    <button type="submit" className="cd-btn cd-btn--cta cd-btn--primary cd-btn--submit" disabled={busy || !division || openDivisions.length === 0}>
                        {busy ? 'Đang gửi…' : <>Gửi đăng ký <ArrowIcon /></>}
                    </button>
                    {openDivisions.length === 0 ? <Notice tone="warn">Giải hiện không có nội dung nào nhận đăng ký.</Notice> : null}
                </form>
            </div>
        </div>
    );
}
