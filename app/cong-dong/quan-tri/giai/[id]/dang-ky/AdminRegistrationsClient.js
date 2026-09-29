'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { FeeChip, Notice, StatusBadge } from '../../../../CommunityUi';
import { api, errorText, formatDateTime } from '../../../../communityClient';
import AdminShell from '../../../AdminShell';

const FILTERS = [
    { key: 'all', label: 'Tất cả', test: () => true },
    { key: 'pending', label: 'Chờ duyệt', test: (r) => r.status === 'submitted' && !r.waitlistPosition },
    { key: 'approved', label: 'Đã duyệt', test: (r) => r.status === 'approved' },
    { key: 'waitlist', label: 'Danh sách chờ', test: (r) => !!r.waitlistPosition },
    { key: 'awaiting', label: 'Đang tìm bạn', test: (r) => r.status === 'awaiting_partner' },
    { key: 'rejected', label: 'Từ chối', test: (r) => r.status === 'rejected' },
];
const ACTION_LABELS = {
    admit: 'Duyệt', reject: 'Từ chối', remove: 'Bỏ duyệt', restore: 'Khôi phục', withdraw: 'Rút đơn',
    fee_confirm: 'Đánh dấu đã thu', fee_unconfirm: 'Bỏ đánh dấu thu',
};
const RESULT_TEXT = {
    admit: 'Đã duyệt', reject: 'Đã từ chối', remove: 'Đã bỏ duyệt', restore: 'Đã khôi phục', withdraw: 'Đã rút đơn',
    fee_confirm: 'Đã đánh dấu đã thu', fee_unconfirm: 'Đã bỏ đánh dấu thu', merge: 'Đã ghép cặp',
};
const GENDER_LABEL = { male: 'Nam', female: 'Nữ' };

// Bảng duyệt đăng ký (Epic 4 C2; Stitch PLA-02). Admin thấy SĐT VĐV; mọi thao tác đi qua RPC nguyên tử qua
// /community/admin/registrations/[id] (kèm version để phát hiện xung đột).
export default function AdminRegistrationsClient({ tournamentId, role }) {
    const [tournament, setTournament] = useState(null);
    const [divisionId, setDivisionId] = useState(null);
    const [board, setBoard] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState({ tone: '', text: '' });
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(() => new Set());
    const [soloSelected, setSoloSelected] = useState(() => new Set());
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        api('/api/tournament-v2/community/admin/tournaments').then((result) => {
            if (!alive) return;
            if (!result.ok) { setError(errorText(result, 'Không tải được giải.')); return; }
            const found = (result.data.tournaments || []).find((t) => t.id === tournamentId);
            if (!found) { setError('Không tìm thấy giải cộng đồng này.'); return; }
            setTournament(found);
            setDivisionId(found.divisions[0]?.id ?? null);
        });
        return () => { alive = false; };
    }, [tournamentId]);

    const loadBoard = useCallback(async (id) => {
        if (!id) return;
        const result = await api(`/api/tournament-v2/community/admin/registrations?divisionId=${id}`);
        if (!result.ok) { setError(errorText(result, 'Không tải được danh sách đăng ký.')); return; }
        setError('');
        setBoard(result.data);
        setSelected(new Set());
        setSoloSelected(new Set());
    }, []);

    useEffect(() => { loadBoard(divisionId); }, [divisionId, loadBoard]);

    const rows = useMemo(() => {
        if (!board) return [];
        const test = FILTERS.find((f) => f.key === filter).test;
        const text = query.trim().toLowerCase();
        const digits = text.replace(/\D/g, '');
        return board.registrations.filter((r) => test(r) && (!text || r.seats.some((s) => s.name.toLowerCase().includes(text) || (digits.length >= 3 && s.phone.includes(digits)))));
    }, [board, filter, query]);

    const solos = board ? board.registrations.filter((r) => r.status === 'awaiting_partner') : [];

    async function run(row, action, extra = {}) {
        const result = await api(`/api/tournament-v2/community/admin/registrations/${row.id}`, { method: 'POST', body: { action, version: row.version, ...extra } });
        return result;
    }

    async function actOne(row, action) {
        setBusy(true);
        const result = await run(row, action);
        setBusy(false);
        if (!result.ok) { setNotice({ tone: 'error', text: errorText(result) }); await loadBoard(divisionId); return; }
        setNotice({ tone: 'ok', text: `${RESULT_TEXT[action]}: ${row.seats.map((s) => s.name).join(' & ')}.` });
        await loadBoard(divisionId);
    }

    async function actBulk(action) {
        const targets = rows.filter((r) => selected.has(r.id) && r.actions.some((a) => a.action === action && !a.disabled));
        if (!targets.length) { setNotice({ tone: 'error', text: `Không có đơn nào đã chọn có thể "${ACTION_LABELS[action]}".` }); return; }
        setBusy(true);
        let done = 0;
        let failed = 0;
        let lastError = '';
        for (const row of targets) {
            const result = await run(row, action);
            if (result.ok) done += 1;
            else { failed += 1; lastError = errorText(result); }
        }
        setBusy(false);
        setNotice(failed
            ? { tone: 'error', text: `${RESULT_TEXT[action]} ${done} đơn, ${failed} đơn lỗi: ${lastError}` }
            : { tone: 'ok', text: `${RESULT_TEXT[action]} ${done} đơn.` });
        await loadBoard(divisionId);
    }

    async function mergeSolos() {
        const [first, second] = solos.filter((r) => soloSelected.has(r.id));
        if (!first || !second || soloSelected.size !== 2) { setNotice({ tone: 'error', text: 'Chọn đúng hai VĐV lẻ để ghép hộ.' }); return; }
        setBusy(true);
        const result = await run(first, 'merge', { partnerRegistrationId: second.id });
        setBusy(false);
        if (!result.ok) { setNotice({ tone: 'error', text: errorText(result) }); await loadBoard(divisionId); return; }
        setNotice({ tone: 'ok', text: `${RESULT_TEXT.merge}: ${first.seats[0].name} & ${second.seats[0].name}.` });
        await loadBoard(divisionId);
    }

    const toggle = (setter) => (id) => setter((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const toggleRow = toggle(setSelected);
    const toggleSolo = toggle(setSoloSelected);
    const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

    return (
        <AdminShell role={role} active="registrations" tournamentId={tournamentId} title="Duyệt đăng ký"
            breadcrumb={tournament ? `Giải cộng đồng / ${tournament.name} / Đăng ký` : null}>
            {error ? <p className="cd-alert" role="alert">{error}</p> : null}
            {notice.text ? <Notice tone={notice.tone === 'error' ? 'error' : 'ok'}>{notice.text}</Notice> : null}
            {board?.tournament.locked ? <Notice tone="warn">Giải đã chốt danh sách nên không thể thay đổi đơn.</Notice> : null}

            {tournament ? (
                <div className="cd-tabs cd-tabs--scroll" role="tablist" aria-label="Nội dung thi đấu">
                    {tournament.divisions.map((d) => (
                        <button key={d.id} type="button" role="tab" className="cd-tab" aria-selected={divisionId === d.id} onClick={() => { setDivisionId(d.id); setBoard(null); }}>{d.name}</button>
                    ))}
                </div>
            ) : null}

            {board ? (
                <>
                    <div className="ad-stats" role="list">
                        <div className="ad-stat" role="listitem"><span>Đã duyệt</span><strong>{board.counts.approved}{board.division.capacity != null ? `/${board.division.capacity}` : ''}</strong></div>
                        <div className="ad-stat" role="listitem"><span>Chờ duyệt</span><strong>{board.counts.submitted}</strong></div>
                        <div className="ad-stat" role="listitem"><span>Danh sách chờ</span><strong>{board.counts.waitlist}</strong></div>
                        <div className="ad-stat" role="listitem"><span>Đang tìm bạn</span><strong>{board.counts.awaitingPartner}</strong></div>
                        <div className="ad-stat" role="listitem"><span>Chưa thu phí</span><strong>{board.counts.unpaid}</strong></div>
                    </div>

                    <div className="cd-filters">
                        <label className="cd-search"><span className="cd-sr">Tìm theo tên hoặc số điện thoại</span>
                            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc số điện thoại" /></label>
                        <div className="cd-chips" role="group" aria-label="Lọc trạng thái">
                            {FILTERS.map((f) => <button key={f.key} type="button" className="cd-filterchip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>)}
                        </div>
                    </div>

                    {selected.size > 0 ? (
                        <div className="ad-bulkbar" role="region" aria-label="Thao tác hàng loạt">
                            <strong>Đã chọn {selected.size} đơn</strong>
                            <span className="cd-actions">
                                <button type="button" className="cd-btn cd-btn--primary cd-btn--sm" disabled={busy} onClick={() => actBulk('admit')}>Duyệt</button>
                                <button type="button" className="cd-btn cd-btn--ghost cd-btn--sm" disabled={busy} onClick={() => actBulk('reject')}>Từ chối</button>
                                {Number(board.division.entryFee) > 0 ? <button type="button" className="cd-btn cd-btn--ghost cd-btn--sm" disabled={busy} onClick={() => actBulk('fee_confirm')}>Đánh dấu đã thu</button> : null}
                            </span>
                        </div>
                    ) : null}

                    <section className="cd-card cd-card--flat ad-table-card" aria-label="Danh sách đơn đăng ký">
                        <div className="ad-tablewrap">
                            <table className="ad-table ad-table--regs">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" aria-label="Chọn tất cả" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                                        <th>Cặp</th><th>Số điện thoại</th><th>PHR</th><th>Trạng thái</th><th>Lệ phí</th><th>Đăng ký lúc</th><th>Hành động</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.id} data-selected={selected.has(r.id)}>
                                            <td data-label="Chọn"><input type="checkbox" aria-label={`Chọn ${r.seats.map((s) => s.name).join(' và ')}`} checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} /></td>
                                            <td data-label="Cặp">
                                                <strong>{r.seats.map((s) => s.name).join(' & ')}</strong>
                                                {r.seats.some((s) => s.duplicateName) ? <span className="cd-note cd-note--inline" data-tone="warn">Trùng tên với 1 tài khoản khác</span> : null}
                                            </td>
                                            <td data-label="Số điện thoại">{r.seats.map((s) => <span className="ad-line" key={s.seat}>{s.phone}</span>)}</td>
                                            <td data-label="PHR">{r.seats.map((s) => <span className="ad-line" key={s.seat}>{s.phr ?? '—'}{s.gender ? ` · ${GENDER_LABEL[s.gender]}` : ''}</span>)}</td>
                                            <td data-label="Trạng thái"><StatusBadge tone={r.state.tone}>{r.state.label}</StatusBadge></td>
                                            <td data-label="Lệ phí"><FeeChip fee={r.fee} /></td>
                                            <td data-label="Đăng ký lúc">{formatDateTime(r.createdAt)}</td>
                                            <td data-label="Hành động">
                                                <span className="cd-actions">
                                                    {r.actions.map((a) => (
                                                        <button key={a.action} type="button" className={`cd-btn cd-btn--sm ${a.action === 'admit' ? 'cd-btn--primary' : 'cd-btn--ghost'}`}
                                                            disabled={busy || a.disabled || board.tournament.locked} title={a.disabled ? 'Nội dung đã đủ số cặp' : undefined}
                                                            onClick={() => actOne(r, a.action)}>{ACTION_LABELS[a.action]}</button>
                                                    ))}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {rows.length === 0 ? <p className="cd-empty">Không có đơn nào khớp bộ lọc.</p> : null}
                    </section>

                    <section className="cd-card cd-card--flat" aria-label="VĐV lẻ đang tìm bạn">
                        <h2 className="cd-subtitle">VĐV lẻ đang tìm bạn</h2>
                        {solos.length === 0 ? <p className="cd-muted">Không có VĐV lẻ nào đang chờ ghép.</p> : (
                            <>
                                {solos.map((r) => (
                                    <label className="cd-row" key={r.id}>
                                        <span><input type="checkbox" checked={soloSelected.has(r.id)} onChange={() => toggleSolo(r.id)} /> <strong>{r.seats[0].name}</strong>{r.seats[0].gender ? ` · ${GENDER_LABEL[r.seats[0].gender]}` : ''}{r.seats[0].phr != null ? ` · ${r.seats[0].phr}` : ''}</span>
                                        <span className="cd-muted">{r.seats[0].phone}</span>
                                    </label>
                                ))}
                                <button type="button" className="cd-btn cd-btn--primary" disabled={busy || soloSelected.size !== 2 || board.tournament.locked} onClick={mergeSolos}>Ghép hộ hai người đã chọn</button>
                            </>
                        )}
                    </section>
                </>
            ) : (!error && tournament ? <p className="cd-lead" aria-busy="true">Đang tải…</p> : null)}
        </AdminShell>
    );
}
