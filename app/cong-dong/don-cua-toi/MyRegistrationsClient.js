'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { FeeChip, Notice, StatusBadge } from '../CommunityUi';
import { api, errorText, formatDate, loginUrl } from '../communityClient';

export default function MyRegistrationsClient() {
    const router = useRouter();
    const [state, setState] = useState({ loading: true, error: '', registrations: [], invitesIn: [] });
    const [busyId, setBusyId] = useState(null);
    const [notice, setNotice] = useState({ tone: '', text: '' });
    const [confirmId, setConfirmId] = useState(null);

    const load = useCallback(async () => {
        const result = await api('/api/tournament-v2/community/my');
        if (result.status === 401) { router.replace(loginUrl('/cong-dong/don-cua-toi')); return; }
        if (!result.ok) { setState({ loading: false, error: errorText(result, 'Không tải được đơn của bạn.'), registrations: [], invitesIn: [] }); return; }
        setState({ loading: false, error: '', registrations: result.data.registrations || [], invitesIn: result.data.invitesIn || [] });
    }, [router]);

    useEffect(() => { load(); }, [load]);

    async function withdraw(id) {
        setBusyId(id);
        setNotice({ tone: '', text: '' });
        const result = await api(`/api/tournament-v2/community/registrations/${id}/withdraw`, { method: 'POST' });
        setBusyId(null);
        setConfirmId(null);
        if (!result.ok) { setNotice({ tone: 'error', text: errorText(result) }); return; }
        setNotice({ tone: 'ok', text: 'Đã rút đăng ký.' });
        load();
    }

    async function answerInvite(id, action) {
        setBusyId(`invite-${id}`);
        setNotice({ tone: '', text: '' });
        const result = await api(`/api/tournament-v2/community/invites/${id}`, { method: 'PATCH', body: { action } });
        setBusyId(null);
        if (!result.ok) { setNotice({ tone: 'error', text: errorText(result) }); load(); return; }
        setNotice({ tone: 'ok', text: action === 'accept' ? 'Đã nhận lời. Hai bạn đã thành một cặp, chờ ban tổ chức duyệt.' : 'Đã từ chối lời mời.' });
        load();
    }

    return (
        <div className="cd-wide">
            <header className="cd-pagehead">
                <h1 className="cd-title">Đơn của tôi</h1>
                <p className="cd-lead">Theo dõi trạng thái đăng ký các giải bạn tham gia</p>
            </header>

            {notice.text ? <Notice tone={notice.tone === 'error' ? 'error' : 'ok'}>{notice.text}</Notice> : null}
            {state.loading ? <p className="cd-lead" aria-busy="true">Đang tải…</p> : null}
            {state.error ? <p className="cd-alert" role="alert">{state.error}</p> : null}

            {state.invitesIn.length ? (
                <section className="cd-card cd-card--flat" aria-label="Lời mời ghép cặp">
                    <h2 className="cd-subtitle">Lời mời ghép cặp <span className="cd-count">{state.invitesIn.length}</span></h2>
                    {state.invitesIn.map((invite) => (
                        <div className="cd-row" key={invite.id}>
                            <div>
                                <strong>{invite.fromName}</strong> mời bạn ghép cặp
                                <p className="cd-muted">{invite.tournamentName} · {invite.divisionName}{invite.fromPhr != null ? ` · PHR ${invite.fromPhr}` : ''}</p>
                            </div>
                            <div className="cd-actions">
                                <button type="button" className="cd-btn cd-btn--primary cd-btn--sm" disabled={busyId === `invite-${invite.id}`} onClick={() => answerInvite(invite.id, 'accept')}>Nhận lời</button>
                                <button type="button" className="cd-btn cd-btn--ghost cd-btn--sm" disabled={busyId === `invite-${invite.id}`} onClick={() => answerInvite(invite.id, 'decline')}>Từ chối</button>
                            </div>
                        </div>
                    ))}
                </section>
            ) : null}

            <div className="cd-grid cd-grid--2">
                {state.registrations.map((reg) => (
                    <article className="cd-tcard" key={reg.id}>
                        <div className="cd-tcard__head">
                            <div>
                                <h2 className="cd-tcard__title">{reg.tournament.name}</h2>
                                <p className="cd-muted">{reg.division.name}{reg.tournament.eventDate ? ` · ${formatDate(reg.tournament.eventDate)}` : ''}</p>
                            </div>
                            <StatusBadge tone={reg.state.tone}>{reg.state.label}</StatusBadge>
                        </div>
                        <p className="cd-pairline">
                            {reg.partnerName ? reg.seatNames.join(' & ') : `${reg.seatNames[0] || ''}${reg.status === 'awaiting_partner' ? ' · đang tìm bạn ghép' : ''}`}
                        </p>
                        <div className="cd-chips">
                            {Number(reg.division.entryFee) > 0 || reg.fee.key !== 'free' ? <FeeChip fee={reg.fee} /> : null}
                            {reg.pendingInvites > 0 ? <span className="cd-muted">Đã gửi {reg.pendingInvites} lời mời</span> : null}
                        </div>
                        {reg.locked ? <p className="cd-note" data-tone="muted">Giải đã chốt danh sách</p> : (
                            <div className="cd-actions">
                                {reg.canInvite ? <Link className="cd-btn cd-btn--primary cd-btn--sm" href={`/cong-dong/don-cua-toi/${reg.id}/ghep`}>Rủ bạn ghép</Link> : null}
                                {reg.canWithdraw && confirmId !== reg.id ? (
                                    <button type="button" className="cd-btn cd-btn--ghost cd-btn--sm" onClick={() => setConfirmId(reg.id)}>Rút đăng ký</button>
                                ) : null}
                                {confirmId === reg.id ? (
                                    <>
                                        <span className="cd-muted">Rút đơn này?</span>
                                        <button type="button" className="cd-btn cd-btn--danger cd-btn--sm" disabled={busyId === reg.id} onClick={() => withdraw(reg.id)}>Xác nhận rút</button>
                                        <button type="button" className="cd-btn cd-btn--ghost cd-btn--sm" onClick={() => setConfirmId(null)}>Giữ lại</button>
                                    </>
                                ) : null}
                            </div>
                        )}
                    </article>
                ))}
            </div>

            {!state.loading && !state.error && state.registrations.length === 0 ? (
                <div className="cd-empty">
                    <p>Bạn chưa đăng ký giải nào.</p>
                    <Link className="cd-btn cd-btn--primary" href="/cong-dong">Xem các giải đang mở</Link>
                </div>
            ) : null}
        </div>
    );
}
