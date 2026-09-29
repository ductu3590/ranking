'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CalendarIcon, PinIcon } from '../../CommunityUi';
import { api, errorText, formatDate, formatVnd, loginUrl } from '../../communityClient';

export default function JoinLinkClient({ token }) {
    const router = useRouter();
    const [state, setState] = useState({ loading: true, error: '', preview: null });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        api(`/api/tournament-v2/community/join?token=${encodeURIComponent(token)}`).then((result) => {
            if (!alive) return;
            if (result.status === 401) { router.replace(loginUrl(`/cong-dong/ghep/${token}`)); return; }
            if (!result.ok) setState({ loading: false, error: errorText(result, 'Link rủ không hợp lệ hoặc đã hết hạn.'), preview: null });
            else setState({ loading: false, error: '', preview: result.data });
        });
        return () => { alive = false; };
    }, [token, router]);

    async function join() {
        setBusy(true);
        setError('');
        const result = await api('/api/tournament-v2/community/join', { method: 'POST', body: { token } });
        if (result.status === 401) { router.replace(loginUrl(`/cong-dong/ghep/${token}`)); return; }
        if (!result.ok) { setError(errorText(result)); setBusy(false); return; }
        router.replace('/cong-dong/don-cua-toi');
    }

    if (state.loading) return <section className="cd-card"><p className="cd-lead" aria-busy="true">Đang kiểm tra link…</p></section>;
    if (state.error) {
        return (
            <section className="cd-card">
                <h1 className="cd-title">Không dùng được link này</h1>
                <p className="cd-alert" role="alert">{state.error}</p>
                <Link className="cd-btn cd-btn--ghost" href="/cong-dong">Xem các giải đang mở</Link>
            </section>
        );
    }
    const { preview } = state;
    return (
        <section className="cd-card" aria-labelledby="cd-join-title">
            <h1 id="cd-join-title" className="cd-title">{preview.inviterName} rủ bạn ghép cặp</h1>
            <p className="cd-lead">{preview.tournament.name} · {preview.divisionName}</p>
            <ul className="cd-meta">
                {preview.tournament.location ? <li><PinIcon /> {preview.tournament.location}</li> : null}
                {preview.tournament.eventDate ? <li><CalendarIcon /> {formatDate(preview.tournament.eventDate, { withWeekday: true })}</li> : null}
                <li>Lệ phí {formatVnd(preview.entryFee)}{Number(preview.entryFee) > 0 ? '/cặp' : ''}</li>
                {preview.expiresAt ? <li>Link hết hạn {formatDate(preview.expiresAt)}</li> : null}
            </ul>
            {preview.isSelf ? <p className="cd-note" data-tone="warn">Đây là link của chính bạn. Hãy gửi link này cho bạn ghép.</p> : (
                <>
                    {error ? <p className="cd-alert" role="alert">{error}</p> : null}
                    <button type="button" className="cd-btn cd-btn--primary cd-btn--block" disabled={busy} onClick={join}>{busy ? 'Đang ghép cặp…' : 'Ghép cặp với bạn này'}</button>
                    <p className="cd-legal">Sau khi ghép cặp, đơn của hai bạn chờ ban tổ chức duyệt.</p>
                </>
            )}
        </section>
    );
}
