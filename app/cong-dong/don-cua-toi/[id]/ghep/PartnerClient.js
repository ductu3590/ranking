'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { BellIcon, CopyIcon, LinkIcon, Notice, PhoneIcon, SendIcon, StatusBadge, UsersIcon } from '../../../CommunityUi';
import { api, errorText, formatDate, initialsOf as initialOf, loginUrl } from '../../../communityClient';

const GENDER_LABEL = { male: 'Nam', female: 'Nữ' };
const TABS = [
    { key: 'link', label: 'Link rủ' },
    { key: 'phone', label: 'Mời theo SĐT' },
    { key: 'incoming', label: 'Lời mời đến' },
    { key: 'board', label: 'Tìm bạn ghép' },
];

function PhrLine({ gender, phr }) {
    return (
        <span className="cd-personmeta">
            {gender ? <span>{GENDER_LABEL[gender]}</span> : null}
            {gender && phr != null ? <i aria-hidden="true" /> : null}
            {phr != null ? <em className="cd-phrtext">PHR {Number(phr).toFixed(2)}</em> : null}
        </span>
    );
}

function Person({ name, gender, phr }) {
    return (
        <span className="cd-person">
            <span className="cd-avatar cd-avatar--lg" aria-hidden="true" data-gender={gender || undefined}>{initialOf(name)}</span>
            <span className="cd-person__text">
                <b>{name}</b>
                <PhrLine gender={gender} phr={phr} />
            </span>
        </span>
    );
}

export default function PartnerClient({ registrationId }) {
    const router = useRouter();
    const [state, setState] = useState({ loading: true, error: '', reg: null, invitesIn: [], board: [] });
    const [tab, setTab] = useState('link');
    const [linkPath, setLinkPath] = useState('');
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState('');
    const [notice, setNotice] = useState({ tone: '', text: '' });
    const [invited, setInvited] = useState(() => new Set());

    const load = useCallback(async () => {
        const my = await api('/api/tournament-v2/community/my');
        if (my.status === 401) { router.replace(loginUrl(`/cong-dong/don-cua-toi/${registrationId}/ghep`)); return; }
        const reg = (my.data.registrations || []).find((r) => r.id === registrationId);
        if (!my.ok || !reg) { setState({ loading: false, error: 'Không tìm thấy đơn này.', reg: null, invitesIn: [], board: [] }); return; }
        const invitesIn = (my.data.invitesIn || []);
        let board = [];
        if (reg.status === 'awaiting_partner') {
            const result = await api(`/api/tournament-v2/community/partner-board?divisionId=${reg.division.id}`);
            board = result.ok ? result.data.candidates || [] : [];
        }
        setState({ loading: false, error: '', reg, invitesIn, board });
    }, [registrationId, router]);

    useEffect(() => { load(); }, [load]);

    async function createLink() {
        setBusy('link');
        setNotice({ tone: '', text: '' });
        const result = await api('/api/tournament-v2/community/partner-link', { method: 'POST', body: { registrationId } });
        setBusy('');
        if (!result.ok) { setNotice({ tone: 'error', text: errorText(result) }); return; }
        setLinkPath(result.data.path);
        setNotice({ tone: 'ok', text: 'Đã tạo link mới. Link cũ (nếu có) không còn dùng được.' });
        load();
    }

    const fullLink = linkPath ? `${typeof window === 'undefined' ? '' : window.location.origin}${linkPath}` : '';

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(fullLink);
            setNotice({ tone: 'ok', text: 'Đã sao chép link.' });
        } catch {
            setNotice({ tone: 'error', text: 'Không sao chép được. Hãy chọn và sao chép link thủ công.' });
        }
    }

    async function sendPhoneInvite(event) {
        event.preventDefault();
        setBusy('phone');
        setNotice({ tone: '', text: '' });
        const result = await api('/api/tournament-v2/community/invites', { method: 'POST', body: { registrationId, partnerPhone: phone } });
        setBusy('');
        if (!result.ok) { setNotice({ tone: 'error', text: errorText(result) }); return; }
        setPhone('');
        setNotice({ tone: 'ok', text: 'Đã gửi lời mời. Nếu số điện thoại đó có tài khoản VĐV, bạn ấy sẽ thấy lời mời trong "Đơn của tôi".' });
    }

    async function inviteFromBoard(candidate) {
        setBusy(`board-${candidate.registrationId}`);
        setNotice({ tone: '', text: '' });
        const result = await api('/api/tournament-v2/community/invites', { method: 'POST', body: { registrationId, targetRegistrationId: candidate.registrationId } });
        setBusy('');
        if (!result.ok) { setNotice({ tone: 'error', text: errorText(result) }); return; }
        setInvited((prev) => new Set(prev).add(candidate.registrationId));
        setNotice({ tone: 'ok', text: `Đã mời ${candidate.displayName}.` });
    }

    async function answer(id, action) {
        setBusy(`invite-${id}`);
        const result = await api(`/api/tournament-v2/community/invites/${id}`, { method: 'PATCH', body: { action } });
        setBusy('');
        if (!result.ok) { setNotice({ tone: 'error', text: errorText(result) }); load(); return; }
        if (action === 'accept') { router.replace('/cong-dong/don-cua-toi'); return; }
        load();
    }

    if (state.loading) return <div className="cd-wide"><p className="cd-lead" aria-busy="true">Đang tải…</p></div>;
    if (state.error) return <div className="cd-wide"><p className="cd-alert" role="alert">{state.error}</p><Link className="cd-btn cd-btn--ghost" href="/cong-dong/don-cua-toi">Về Đơn của tôi</Link></div>;

    const { reg, invitesIn, board } = state;
    const active = reg.status === 'awaiting_partner';
    const relevantInvites = invitesIn.filter((i) => i.divisionName === reg.division.name && i.tournamentName === reg.tournament.name);

    return (
        <div className="cd-wide cd-partner">
            <header className="cd-pagehead cd-pagehead--row">
                <div>
                    <h1 className="cd-title cd-title--xl">Rủ bạn ghép cặp</h1>
                    <p className="cd-lead">{reg.tournament.name} · {reg.division.name}{reg.tournament.eventDate ? ` · ${formatDate(reg.tournament.eventDate)}` : ''}</p>
                </div>
                <StatusBadge tone={reg.state.tone}>{reg.state.label}</StatusBadge>
            </header>

            {notice.text ? <Notice tone={notice.tone === 'error' ? 'error' : 'ok'}>{notice.text}</Notice> : null}
            {!active ? (
                <div className="cd-card">
                    <p>Đơn này không còn ở trạng thái chờ bạn ghép.</p>
                    <Link className="cd-btn cd-btn--primary" href="/cong-dong/don-cua-toi">Về Đơn của tôi</Link>
                </div>
            ) : (
                <>
                    <div className="cd-tabs cd-tabs--scroll cd-show-sm" role="tablist" aria-label="Cách rủ bạn">
                        {TABS.map((item) => (
                            <button key={item.key} type="button" role="tab" className="cd-tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}>
                                {item.label}{item.key === 'incoming' && relevantInvites.length ? ` (${relevantInvites.length})` : ''}
                            </button>
                        ))}
                    </div>

                    <div className="cd-grid cd-grid--2 cd-panels cd-pcards">
                        <section className="cd-card cd-pcard" data-panel="link" data-current={tab === 'link'}>
                            <h2 className="cd-pcard__title"><LinkIcon /> Link rủ bạn</h2>
                            <div className="cd-pcard__body">
                                {fullLink ? (
                                    <>
                                        <input className="cd-copybox" readOnly value={fullLink} aria-label="Link rủ bạn" onFocus={(e) => e.target.select()} />
                                        <div className="cd-actions">
                                            <button type="button" className="cd-btn cd-btn--primary cd-btn--icon" onClick={copyLink}><CopyIcon /> Sao chép</button>
                                            <a className="cd-btn cd-btn--ghost cd-btn--icon" target="_blank" rel="noopener noreferrer" href={`https://zalo.me/share?url=${encodeURIComponent(fullLink)}`}>Chia sẻ Zalo</a>
                                        </div>
                                    </>
                                ) : (
                                    <p className="cd-muted">{reg.linkActive ? 'Bạn đã có một link còn hiệu lực. Vì lý do an toàn link chỉ hiện đúng một lần khi tạo; hãy tạo link mới nếu cần gửi lại.' : 'Chưa có link. Tạo link rồi gửi cho bạn ghép.'}</p>
                                )}
                            </div>
                            <div className="cd-pcard__foot">
                                <p className="cd-hint">Link hết hạn sau 7 ngày. Tạo link mới sẽ làm link cũ mất hiệu lực.</p>
                                <button type="button" className="cd-linkbtn cd-linkbtn--brand" disabled={busy === 'link'} onClick={createLink}>{fullLink || reg.linkActive ? 'Tạo link mới' : 'Tạo link'}</button>
                            </div>
                        </section>

                        <section className="cd-card cd-pcard" data-panel="phone" data-current={tab === 'phone'}>
                            <h2 className="cd-pcard__title"><PhoneIcon /> Mời theo số điện thoại</h2>
                            <form className="cd-pcard__body" onSubmit={sendPhoneInvite}>
                                <div className="cd-field">
                                    <label className="cd-sr" htmlFor="cd-invite-phone">Số điện thoại của bạn ghép</label>
                                    <input id="cd-invite-phone" type="tel" inputMode="tel" placeholder="Số điện thoại của bạn ghép" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                                </div>
                                <div className="cd-actions"><button type="submit" className="cd-btn cd-btn--primary cd-btn--icon" disabled={busy === 'phone'}><SendIcon /> Gửi lời mời</button></div>
                            </form>
                            <div className="cd-pcard__foot"><p className="cd-hint">Bạn ghép cần có tài khoản VĐV PickHub.</p></div>
                        </section>

                        <section className="cd-card cd-pcard" data-panel="incoming" data-current={tab === 'incoming'}>
                            <div className="cd-pcard__headrow">
                                <h2 className="cd-pcard__title"><BellIcon /> Lời mời đến</h2>
                                {relevantInvites.length ? <span className="cd-countchip">{relevantInvites.length} lời mời</span> : null}
                            </div>
                            <div className="cd-pcard__body">
                                {relevantInvites.length === 0 ? <p className="cd-muted">Chưa có lời mời nào.</p> : relevantInvites.map((invite) => (
                                    <div className="cd-invitebox" key={invite.id}>
                                        <span className="cd-person">
                                            <span className="cd-avatar cd-avatar--lg" aria-hidden="true">{initialOf(invite.fromName)}</span>
                                            <span className="cd-person__text">
                                                <b>{invite.fromName} mời bạn ghép cặp</b>
                                                <PhrLine gender={invite.fromGender} phr={invite.fromPhr} />
                                            </span>
                                        </span>
                                        <span className="cd-actions">
                                            <button type="button" className="cd-btn cd-btn--primary cd-btn--sm" disabled={busy === `invite-${invite.id}`} onClick={() => answer(invite.id, 'accept')}>Nhận lời</button>
                                            <button type="button" className="cd-btn cd-btn--ghost cd-btn--sm" disabled={busy === `invite-${invite.id}`} onClick={() => answer(invite.id, 'decline')}>Từ chối</button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="cd-pcard__foot"><p className="cd-hint">Chấp nhận lời mời sẽ tự động hoàn tất đăng ký của cả hai.</p></div>
                        </section>

                        <section className="cd-card cd-pcard" data-panel="board" data-current={tab === 'board'}>
                            <div className="cd-pcard__headrow">
                                <h2 className="cd-pcard__title"><UsersIcon /> Bảng tìm bạn ghép</h2>
                                <span className="cd-hint">Đang tìm cặp</span>
                            </div>
                            <div className="cd-pcard__body">
                                <p className="cd-hint">Chỉ hiển thị tên, không hiện số điện thoại</p>
                                {board.length === 0 ? <p className="cd-muted">Chưa có ai khác đang tìm bạn ghép trong nội dung này.</p> : (
                                    <div className="cd-boardlist">
                                        {board.map((candidate) => (
                                            <div className="cd-boardrow" key={candidate.registrationId}>
                                                <Person name={candidate.displayName} gender={candidate.gender} phr={candidate.selfDeclaredPhr} />
                                                {invited.has(candidate.registrationId)
                                                    ? <span className="cd-chip" data-tone="muted">Đã mời</span>
                                                    : <button type="button" className="cd-btn cd-btn--primary cd-btn--sm cd-btn--pill" disabled={busy === `board-${candidate.registrationId}`} onClick={() => inviteFromBoard(candidate)}>Mời</button>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="cd-pcard__foot"><p className="cd-hint">Danh sách cập nhật thời gian thực khi có VĐV đăng đơn mới.</p></div>
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}
