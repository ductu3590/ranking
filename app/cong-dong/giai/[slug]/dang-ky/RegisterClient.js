'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CalendarIcon, Notice, PinIcon, ProgressBar } from '../../../CommunityUi';
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
        <div className="cd-wide">
            <div className="cd-split cd-split--form">
                <form className="cd-card cd-form" onSubmit={submit}>
                    <h1 className="cd-title">Đăng ký tham gia</h1>
                    {error.text ? (
                        <p className="cd-alert" role="alert">
                            {error.text}{' '}
                            {PROFILE_CODES.includes(error.code) ? <Link href="/cong-dong/tai-khoan/ho-so">Sửa hồ sơ</Link> : null}
                        </p>
                    ) : null}

                    <fieldset className="cd-fieldset">
                        <legend>Chọn nội dung</legend>
                        {divisions.map((d) => (
                            <label key={d.id} className="cd-choice" data-active={divisionId === d.id} data-disabled={!d.open.ok}>
                                <input type="radio" name="division" value={d.id} checked={divisionId === d.id} disabled={!d.open.ok}
                                    onChange={() => setDivisionId(d.id)} />
                                <span className="cd-choice__body">
                                    <strong>{d.name}</strong>
                                    <span className="cd-muted">
                                        {d.summary.capacity != null ? `${d.summary.approved}/${d.summary.capacity} cặp` : `${d.summary.approved} cặp`} · {formatVnd(d.entryFee)}{Number(d.entryFee) > 0 ? '/cặp' : ''}
                                        {!d.open.ok ? ' · Đã đóng đăng ký' : ''}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </fieldset>

                    <fieldset className="cd-fieldset">
                        <legend>Hồ sơ của bạn</legend>
                        <div className="cd-readonly">
                            <span>{account.displayName}{account.gender ? ` · ${GENDER_LABEL[account.gender]}` : ''}{account.selfDeclaredPhr != null ? ` · PHR ${account.selfDeclaredPhr}` : ''}</span>
                            <Link href="/cong-dong/tai-khoan/ho-so">Sửa hồ sơ</Link>
                        </div>
                    </fieldset>

                    {isPair ? (
                        <fieldset className="cd-fieldset">
                            <legend>Bạn ghép cặp</legend>
                            <label className="cd-choice" data-active={partnerMode === 'have'}>
                                <input type="radio" name="partner" checked={partnerMode === 'have'} onChange={() => setPartnerMode('have')} />
                                <span className="cd-choice__body"><strong>Tôi đã có bạn ghép</strong></span>
                            </label>
                            {partnerMode === 'have' ? (
                                <div className="cd-field cd-field--nested">
                                    <label htmlFor="cd-partner-phone">Số điện thoại của bạn ghép</label>
                                    <input id="cd-partner-phone" type="tel" inputMode="tel" placeholder="0912 345 678" value={partnerPhone} onChange={(e) => setPartnerPhone(e.target.value)} required />
                                    <p className="cd-hint">Bạn ghép cần có tài khoản VĐV PickHub. Hệ thống sẽ gửi lời mời cho bạn ấy.</p>
                                </div>
                            ) : null}
                            <label className="cd-choice" data-active={partnerMode === 'need'}>
                                <input type="radio" name="partner" checked={partnerMode === 'need'} onChange={() => setPartnerMode('need')} />
                                <span className="cd-choice__body">
                                    <strong>Tôi cần tìm bạn ghép</strong>
                                    <span className="cd-muted">Đơn của bạn ở trạng thái Chờ bạn ghép cho tới khi có người nhận lời</span>
                                </span>
                            </label>
                        </fieldset>
                    ) : null}

                    {fee > 0 ? <Notice tone="warn">Lệ phí {formatVnd(fee)}/cặp thu ngoài hệ thống. Ban tổ chức sẽ liên hệ qua số điện thoại của bạn.</Notice> : null}

                    <div className="cd-honeypot" aria-hidden="true">
                        <label htmlFor="cd-reg-company">Công ty</label>
                        <input id="cd-reg-company" name="company" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
                    </div>

                    <button type="submit" className="cd-btn cd-btn--primary cd-btn--block" disabled={busy || !division || openDivisions.length === 0}>
                        {busy ? 'Đang gửi…' : 'Gửi đăng ký'}
                    </button>
                    {openDivisions.length === 0 ? <Notice tone="warn">Giải hiện không có nội dung nào nhận đăng ký.</Notice> : null}
                </form>

                <aside className="cd-card cd-sticky" aria-label="Tóm tắt giải">
                    <h2 className="cd-subtitle">{tournament.name}</h2>
                    <ul className="cd-meta">
                        {tournament.location ? <li><PinIcon /> {tournament.location}</li> : null}
                        {tournament.eventDate ? <li><CalendarIcon /> {formatDate(tournament.eventDate, { withWeekday: true })}</li> : null}
                        {division?.deadline ? <li>Hạn đăng ký {formatDate(division.deadline)}</li> : null}
                    </ul>
                    {division?.summary.capacity != null
                        ? <ProgressBar value={division.summary.approved} max={division.summary.capacity} label={`${division.summary.approved}/${division.summary.capacity} cặp đã duyệt`} />
                        : null}
                    <Link className="cd-link" href={`/cong-dong/giai/${tournament.slug}`}>Xem trang giải</Link>
                </aside>
            </div>
        </div>
    );
}
