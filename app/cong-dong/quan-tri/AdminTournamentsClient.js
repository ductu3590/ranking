'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Notice, ProgressBar, StatusBadge } from '../CommunityUi';
import { api, errorText, formatDate } from '../communityClient';
import AdminShell from './AdminShell';

const PHASES = {
    draft: { tone: 'muted', label: 'Nháp' },
    open: { tone: 'ok', label: 'Đang mở đăng ký' },
    closed: { tone: 'warn', label: 'Đã đóng đăng ký' },
    finalized: { tone: 'brand', label: 'Đã chốt' },
};
const GENDER_OPTIONS = [
    { value: 'any', label: 'Tất cả' },
    { value: 'mixed', label: 'Nam Nữ' },
    { value: 'male', label: 'Nam' },
    { value: 'female', label: 'Nữ' },
];

const emptyRow = () => ({ key: `new-${Math.random().toString(36).slice(2)}`, id: null, name: '', type: 'pair', gender: 'any', cap: '', capacity: '', fee: '', deadline: '' });
const emptyForm = () => ({ id: null, name: '', eventDate: '', startTime: '', location: '', open: false, slug: null, rows: [emptyRow()], locked: false });

function toLocalInput(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formFromTournament(t) {
    return {
        id: t.id,
        name: t.name || '',
        eventDate: t.eventDate || '',
        startTime: t.startTime || '',
        location: t.location || '',
        open: t.openRegistration,
        slug: t.slug,
        locked: t.locked,
        rows: t.divisions.length ? t.divisions.map((d) => ({
            key: `d-${d.id}`,
            id: d.id,
            name: d.name,
            type: d.entrant_type === 'pair' ? 'pair' : 'individual',
            gender: d.gender_mode || 'any',
            cap: d.rating_cap == null ? '' : String(d.rating_cap),
            capacity: d.registration_capacity == null ? '' : String(d.registration_capacity),
            fee: d.entry_fee == null ? '' : String(d.entry_fee),
            deadline: toLocalInput(d.registration_deadline),
        })) : [emptyRow()],
    };
}

function validate(form) {
    if (!form.name.trim()) return 'Nhập tên giải.';
    if (form.rows.length === 0) return 'Thêm ít nhất một nội dung thi đấu.';
    for (const [index, row] of form.rows.entries()) {
        const label = `Nội dung ${index + 1}`;
        if (!row.name.trim()) return `${label}: nhập tên nội dung.`;
        if (row.capacity !== '' && !(Number.isInteger(Number(row.capacity)) && Number(row.capacity) > 0)) return `${label}: hạn mức số cặp phải là số nguyên dương.`;
        if (row.fee !== '' && !(Number.isInteger(Number(row.fee)) && Number(row.fee) >= 0)) return `${label}: lệ phí phải là số nguyên không âm.`;
        if (row.cap !== '' && !(Number(row.cap) > 0)) return `${label}: PHR tối đa phải lớn hơn 0.`;
    }
    return '';
}

// Danh sách giải + form tạo/sửa (Epic 4 C2; Stitch PLA-03). Tạo giải và nội dung dùng các route sẵn có
// (POST /tournaments organizer_mode='community', /divisions) vốn đã nhận platform actor; đóng/mở đăng ký, giờ bắt đầu và
// sửa giải đi qua route admin riêng.
export default function AdminTournamentsClient({ role }) {
    const [state, setState] = useState({ loading: true, error: '', tournaments: [] });
    const [form, setForm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState({ tone: '', text: '' });

    const load = useCallback(async () => {
        const result = await api('/api/tournament-v2/community/admin/tournaments');
        if (!result.ok) { setState({ loading: false, error: errorText(result, 'Không tải được danh sách giải.'), tournaments: [] }); return []; }
        setState({ loading: false, error: '', tournaments: result.data.tournaments || [] });
        return result.data.tournaments || [];
    }, []);

    useEffect(() => {
        let alive = true;
        load().then((tournaments) => {
            if (!alive) return;
            const wanted = Number(new URLSearchParams(window.location.search).get('giai'));
            const found = tournaments.find((t) => t.id === wanted);
            if (found) setForm(formFromTournament(found));
        });
        return () => { alive = false; };
    }, [load]);

    const publicUrl = (slug) => (slug ? `${window.location.origin}/cong-dong/giai/${slug}` : '');

    async function copy(slug) {
        try {
            await navigator.clipboard.writeText(publicUrl(slug));
            setNotice({ tone: 'ok', text: 'Đã sao chép link công khai.' });
        } catch {
            setNotice({ tone: 'error', text: 'Không sao chép được link.' });
        }
    }

    function setRow(key, patch) {
        setForm((prev) => ({ ...prev, rows: prev.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)) }));
    }

    async function save(openAfter) {
        const problem = validate(form);
        if (problem) { setNotice({ tone: 'error', text: problem }); return; }
        setBusy(true);
        setNotice({ tone: '', text: '' });
        let tournamentId = form.id;
        if (!tournamentId) {
            const created = await api('/api/tournament-v2/tournaments', {
                method: 'POST',
                body: { name: form.name.trim(), event_date: form.eventDate || null, location: form.location.trim() || null, organizer_mode: 'community', entrant_type: 'pair', visibility: 'unlisted' },
            });
            if (!created.ok) { setNotice({ tone: 'error', text: errorText(created, 'Không tạo được giải.') }); setBusy(false); return; }
            tournamentId = created.data.tournament.id;
        }
        const wantOpen = openAfter === undefined ? form.open : openAfter;
        const patched = await api('/api/tournament-v2/community/admin/tournaments', {
            method: 'PATCH',
            body: { id: tournamentId, name: form.name.trim(), location: form.location.trim(), eventDate: form.eventDate || null, startTime: form.startTime || '', openRegistration: false },
        });
        if (!patched.ok) { setNotice({ tone: 'error', text: errorText(patched, 'Không lưu được thông tin giải.') }); setBusy(false); load(); return; }

        for (const row of form.rows) {
            const base = {
                name: row.name.trim(),
                play_type: row.type === 'pair' ? 'doubles' : 'singles',
                rating_policy: row.cap !== '' ? 'capped' : 'open',
                rating_cap: row.cap !== '' ? Number(row.cap) : null,
                pairing_mode: 'none',
            };
            const registration = {
                registration_open: true,
                registration_capacity: row.capacity === '' ? null : Number(row.capacity),
                registration_deadline: row.deadline ? new Date(row.deadline).toISOString() : null,
                gender_mode: row.gender,
                entry_fee: row.fee === '' ? null : Number(row.fee),
            };
            let divisionId = row.id;
            if (!divisionId) {
                const made = await api('/api/tournament-v2/divisions', { method: 'POST', body: { tournament_id: tournamentId, ...base } });
                if (!made.ok) { setNotice({ tone: 'error', text: `Nội dung "${row.name}": ${errorText(made, 'không tạo được.')}` }); setBusy(false); load(); return; }
                divisionId = made.data.division.id;
            }
            const updated = await api('/api/tournament-v2/divisions', { method: 'PATCH', body: { id: divisionId, ...base, ...registration } });
            if (!updated.ok) { setNotice({ tone: 'error', text: `Nội dung "${row.name}": ${errorText(updated, 'không lưu được.')}` }); setBusy(false); load(); return; }
        }

        if (wantOpen) {
            const opened = await api('/api/tournament-v2/community/admin/tournaments', { method: 'PATCH', body: { id: tournamentId, openRegistration: true } });
            if (!opened.ok) { setNotice({ tone: 'error', text: errorText(opened, 'Không mở được đăng ký.') }); setBusy(false); load(); return; }
        }
        const tournaments = await load();
        const saved = tournaments.find((t) => t.id === tournamentId);
        if (saved) setForm(formFromTournament(saved));
        setNotice({ tone: 'ok', text: wantOpen ? 'Đã lưu và mở đăng ký.' : 'Đã lưu giải.' });
        setBusy(false);
    }

    async function toggleOpen(tournament, next) {
        setBusy(true);
        const result = await api('/api/tournament-v2/community/admin/tournaments', { method: 'PATCH', body: { id: tournament.id, openRegistration: next } });
        setBusy(false);
        if (!result.ok) { setNotice({ tone: 'error', text: errorText(result) }); return; }
        setNotice({ tone: 'ok', text: next ? 'Đã mở đăng ký.' : 'Đã đóng đăng ký.' });
        const tournaments = await load();
        if (form?.id === tournament.id) {
            const saved = tournaments.find((t) => t.id === tournament.id);
            if (saved) setForm(formFromTournament(saved));
        }
    }

    const editing = form && form.id;

    return (
        <AdminShell role={role} active={form?.id ? 'settings' : 'tournaments'} tournamentId={form?.id || null} title="Giải cộng đồng"
            breadcrumb={form?.id ? `Giải cộng đồng / ${form.name || ''}` : null}>
            <div className="ad-toolbar">
                <p className="cd-lead">Quản lý danh sách giải đấu và thiết lập mở đăng ký</p>
                <button type="button" className="cd-btn cd-btn--primary" onClick={() => { setForm(emptyForm()); setNotice({ tone: '', text: '' }); }}>+ Tạo giải mới</button>
            </div>

            {notice.text ? <Notice tone={notice.tone === 'error' ? 'error' : 'ok'}>{notice.text}</Notice> : null}
            {state.error ? <p className="cd-alert" role="alert">{state.error}</p> : null}

            <section className="cd-card cd-card--flat ad-table-card" aria-label="Danh sách giải đấu cộng đồng">
                <h2 className="cd-subtitle">Danh sách giải đấu cộng đồng</h2>
                {state.loading ? <p className="cd-lead" aria-busy="true">Đang tải…</p> : null}
                {!state.loading && state.tournaments.length === 0 ? <p className="cd-empty">Chưa có giải cộng đồng nào. Bấm &ldquo;Tạo giải mới&rdquo; để bắt đầu.</p> : null}
                {state.tournaments.length ? (
                    <div className="ad-tablewrap">
                        <table className="ad-table">
                            <thead>
                                <tr><th>Tên giải</th><th>Ngày</th><th>Trạng thái</th><th>Cặp đã duyệt</th><th>Hành động</th></tr>
                            </thead>
                            <tbody>
                                {state.tournaments.map((t) => {
                                    const phase = PHASES[t.phase] || PHASES.closed;
                                    return (
                                        <tr key={t.id}>
                                            <td data-label="Tên giải"><strong>{t.name}</strong></td>
                                            <td data-label="Ngày">{formatDate(t.eventDate)}</td>
                                            <td data-label="Trạng thái"><StatusBadge tone={phase.tone}>{phase.label}</StatusBadge></td>
                                            <td data-label="Cặp đã duyệt">
                                                {t.capacityTotal != null
                                                    ? <ProgressBar value={t.approvedTotal} max={t.capacityTotal} label={`${t.approvedTotal}/${t.capacityTotal}`} />
                                                    : `${t.approvedTotal}`}
                                            </td>
                                            <td data-label="Hành động">
                                                <span className="cd-actions">
                                                    <button type="button" className="cd-btn cd-btn--secondary cd-btn--sm" onClick={() => { setForm(formFromTournament(t)); setNotice({ tone: '', text: '' }); }}>Quản lý</button>
                                                    <Link className="cd-btn cd-btn--ghost cd-btn--sm" href={`/cong-dong/quan-tri/giai/${t.id}/dang-ky`}>Duyệt đăng ký</Link>
                                                    {t.slug ? <button type="button" className="cd-btn cd-btn--ghost cd-btn--sm" onClick={() => copy(t.slug)}>Sao chép link</button> : null}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : null}
            </section>

            {form ? (
                <section className="cd-card ad-form" aria-labelledby="ad-form-title">
                    <h2 id="ad-form-title" className="cd-subtitle">{editing ? `Sửa giải: ${form.name || ''}` : 'Tạo giải cộng đồng'}</h2>
                    <p className="cd-lead">Nhập thông tin cơ bản và các nội dung thi đấu cho giải</p>
                    {form.locked ? <Notice tone="warn">Giải đã chốt danh sách nên không sửa được nội dung/đăng ký.</Notice> : null}
                    <div className="ad-formgrid">
                        <div className="cd-field"><label htmlFor="ad-name">Tên giải</label><input id="ad-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={form.locked} /></div>
                        <div className="cd-field"><label htmlFor="ad-date">Ngày thi đấu</label><input id="ad-date" type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} disabled={form.locked} /></div>
                        <div className="cd-field"><label htmlFor="ad-time">Giờ bắt đầu</label><input id="ad-time" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} disabled={form.locked} /></div>
                        <div className="cd-field"><label htmlFor="ad-loc">Địa điểm</label><input id="ad-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={form.locked} /></div>
                    </div>

                    <h3 className="cd-subtitle">Nội dung thi đấu</h3>
                    <div className="ad-rows">
                        {form.rows.map((row, index) => (
                            <fieldset className="ad-row" key={row.key} disabled={form.locked}>
                                <legend>Nội dung {index + 1}</legend>
                                <div className="cd-field"><label htmlFor={`ad-r-name-${row.key}`}>Tên nội dung</label><input id={`ad-r-name-${row.key}`} value={row.name} onChange={(e) => setRow(row.key, { name: e.target.value })} placeholder="Ví dụ: Đôi Nam Nữ" /></div>
                                <div className="cd-field"><label htmlFor={`ad-r-type-${row.key}`}>Loại</label>
                                    <select id={`ad-r-type-${row.key}`} value={row.type} onChange={(e) => setRow(row.key, { type: e.target.value })} disabled={!!row.id}>
                                        <option value="pair">Đôi</option><option value="individual">Đơn</option>
                                    </select></div>
                                <div className="cd-field"><label htmlFor={`ad-r-gender-${row.key}`}>Giới tính</label>
                                    <select id={`ad-r-gender-${row.key}`} value={row.gender} onChange={(e) => setRow(row.key, { gender: e.target.value })}>
                                        {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select></div>
                                <div className="cd-field"><label htmlFor={`ad-r-cap-${row.key}`}>PHR tối đa</label><input id={`ad-r-cap-${row.key}`} type="number" step="0.05" min="0" inputMode="decimal" value={row.cap} onChange={(e) => setRow(row.key, { cap: e.target.value })} placeholder="Không giới hạn" /></div>
                                <div className="cd-field"><label htmlFor={`ad-r-count-${row.key}`}>Hạn mức số cặp</label><input id={`ad-r-count-${row.key}`} type="number" min="1" inputMode="numeric" value={row.capacity} onChange={(e) => setRow(row.key, { capacity: e.target.value })} placeholder="Không giới hạn" /></div>
                                <div className="cd-field"><label htmlFor={`ad-r-fee-${row.key}`}>Lệ phí (đ)</label><input id={`ad-r-fee-${row.key}`} type="number" min="0" inputMode="numeric" value={row.fee} onChange={(e) => setRow(row.key, { fee: e.target.value })} placeholder="Miễn phí" /></div>
                                <div className="cd-field"><label htmlFor={`ad-r-deadline-${row.key}`}>Hạn chót đăng ký</label><input id={`ad-r-deadline-${row.key}`} type="datetime-local" value={row.deadline} onChange={(e) => setRow(row.key, { deadline: e.target.value })} /></div>
                                {!row.id ? <button type="button" className="cd-linkbtn ad-row__remove" onClick={() => setForm({ ...form, rows: form.rows.filter((r) => r.key !== row.key) })}>Xóa nội dung này</button> : null}
                            </fieldset>
                        ))}
                    </div>
                    {!form.locked ? <button type="button" className="cd-btn cd-btn--ghost" onClick={() => setForm({ ...form, rows: [...form.rows, emptyRow()] })}>+ Thêm nội dung</button> : null}

                    <div className="ad-settings">
                        {editing ? (
                            <label className="ad-switch">
                                <input type="checkbox" checked={form.open} disabled={busy || form.locked}
                                    onChange={(e) => { const next = e.target.checked; setForm({ ...form, open: next }); toggleOpen({ id: form.id }, next); }} />
                                <span><strong>Mở đăng ký</strong><span className="cd-muted"> Cho phép vận động viên đăng ký trực tuyến</span></span>
                            </label>
                        ) : null}
                        <div className="cd-field">
                            <label htmlFor="ad-link">Link công khai</label>
                            <div className="cd-copyrow">
                                <input id="ad-link" readOnly value={form.slug ? `/cong-dong/giai/${form.slug}` : 'Sẽ có sau khi lưu giải'} />
                                {form.slug ? <button type="button" className="cd-btn cd-btn--ghost cd-btn--sm" onClick={() => copy(form.slug)}>Sao chép</button> : null}
                            </div>
                        </div>
                    </div>

                    <div className="cd-actions ad-formactions">
                        <button type="button" className="cd-btn cd-btn--ghost" onClick={() => setForm(null)} disabled={busy}>Đóng</button>
                        {!form.locked ? <button type="button" className="cd-btn cd-btn--secondary" disabled={busy} onClick={() => save(undefined)}>{busy ? 'Đang lưu…' : 'Lưu nháp'}</button> : null}
                        {!form.locked && !form.open ? <button type="button" className="cd-btn cd-btn--primary" disabled={busy} onClick={() => save(true)}>Mở đăng ký</button> : null}
                    </div>
                </section>
            ) : null}
        </AdminShell>
    );
}
