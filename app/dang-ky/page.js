'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/pickhub/AppShell';
import './page.css';

const EMPTY_FORM = { login: '', password: '', confirmPassword: '', displayName: '', membershipId: '' };

export default function AthleteSignupPage() {
    const [state, setState] = useState({ kind: 'loading', message: 'Đang tải danh sách VĐV…' });
    const [candidates, setCandidates] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const sessionResponse = await fetch('/api/groups/session', { cache: 'no-store', signal: controller.signal });
                const sessionView = await sessionResponse.json();
                if (!sessionView.permissions?.canViewClub) {
                    setState({ kind: 'forbidden', message: 'Bạn cần vào CLB bằng Mã CLB + mật khẩu trước khi đăng ký tài khoản.' });
                    return;
                }
                const response = await fetch('/api/identity/athlete-accounts', { cache: 'no-store', signal: controller.signal });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Không tải được danh sách VĐV.');
                const list = payload.candidates || [];
                setCandidates(list);
                // CTA từ hồ sơ thành viên truyền sẵn membershipId qua query.
                const requested = new URLSearchParams(window.location.search).get('membershipId');
                const preselected = list.find((item) => String(item.membershipId) === String(requested));
                if (preselected) {
                    setForm((current) => ({
                        ...current,
                        membershipId: String(preselected.membershipId),
                        displayName: current.displayName || preselected.displayName || preselected.alias || '',
                    }));
                }
                setState(payload.candidates?.length
                    ? { kind: 'ready', message: '' }
                    : { kind: 'empty', message: 'CLB chưa có hồ sơ VĐV nào còn trống để liên kết.' });
            } catch (error) {
                if (error.name !== 'AbortError') setState({ kind: 'error', message: error.message });
            }
        }
        load();
        return () => controller.abort();
    }, []);

    function update(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    function pickMembership(membershipId) {
        const chosen = candidates.find((item) => String(item.membershipId) === String(membershipId));
        setForm((current) => ({
            ...current,
            membershipId,
            displayName: current.displayName || chosen?.displayName || chosen?.alias || '',
        }));
    }

    async function submit(event) {
        event.preventDefault();
        setFeedback(null);
        if (form.password !== form.confirmPassword) {
            setFeedback({ kind: 'error', text: 'Mật khẩu nhập lại không khớp.' });
            return;
        }
        setSubmitting(true);
        try {
            const response = await fetch('/api/identity/athlete-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: form.login,
                    password: form.password,
                    displayName: form.displayName,
                    membershipId: Number(form.membershipId),
                }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Không thể tạo tài khoản.');
            setCandidates((current) => current.filter((item) => String(item.membershipId) !== String(form.membershipId)));
            setForm(EMPTY_FORM);
            setFeedback({ kind: 'ok', text: `Đã tạo tài khoản ${payload.account.login} và liên kết với hồ sơ ${payload.account.displayName}.` });
        } catch (error) {
            setFeedback({ kind: 'error', text: error.message });
        } finally {
            setSubmitting(false);
        }
    }

    const canSubmit = form.login && form.password && form.confirmPassword && form.displayName && form.membershipId && !submitting;

    return (
        <AppShell>
            <main className="signup-page">
                <header className="signup-head">
                    <span>Tài khoản VĐV</span>
                    <h1>Đăng ký &amp; liên kết hồ sơ</h1>
                    <p>Tạo tài khoản cá nhân và nhận đúng hồ sơ VĐV đã có sẵn trong CLB. Mỗi hồ sơ chỉ liên kết được một tài khoản.</p>
                </header>

                {state.kind !== 'ready' ? (
                    <section className="signup-card" role={state.kind === 'loading' ? 'status' : 'alert'}>
                        <h2 style={{ margin: 0 }}>
                            {state.kind === 'loading' ? 'Đang tải' : state.kind === 'empty' ? 'Chưa có hồ sơ trống' : 'Chưa thể đăng ký'}
                        </h2>
                        <p style={{ margin: 0, color: 'var(--ph-muted)' }}>{state.message}</p>
                        {state.kind === 'forbidden' && <a className="ph-btn" href="/">Nhập Mã CLB</a>}
                    </section>
                ) : (
                    <form className="signup-card" onSubmit={submit}>
                        {feedback && <p className={`signup-alert is-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}

                        <div className="signup-field">
                            <label htmlFor="signup-membership">Bạn là VĐV nào?</label>
                            <select id="signup-membership" value={form.membershipId} onChange={(event) => pickMembership(event.target.value)} required>
                                <option value="">— Chọn hồ sơ VĐV —</option>
                                {candidates.map((item) => (
                                    <option key={item.membershipId} value={item.membershipId}>
                                        {item.alias || item.displayName}
                                    </option>
                                ))}
                            </select>
                            <small>Chỉ hiển thị hồ sơ đang sinh hoạt và chưa có tài khoản nào nhận.</small>
                        </div>

                        <div className="signup-field">
                            <label htmlFor="signup-name">Họ và tên</label>
                            <input id="signup-name" value={form.displayName} onChange={(event) => update('displayName', event.target.value)} required />
                        </div>

                        <div className="signup-field">
                            <label htmlFor="signup-login">Tên đăng nhập</label>
                            <input id="signup-login" value={form.login} onChange={(event) => update('login', event.target.value.toLowerCase())} autoComplete="username" required />
                            <small>3-30 ký tự: chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.</small>
                        </div>

                        <div className="signup-field">
                            <label htmlFor="signup-password">Mật khẩu</label>
                            <input id="signup-password" type="password" value={form.password} onChange={(event) => update('password', event.target.value)} autoComplete="new-password" required />
                            <small>Tối thiểu 8 ký tự.</small>
                        </div>

                        <div className="signup-field">
                            <label htmlFor="signup-confirm">Nhập lại mật khẩu</label>
                            <input id="signup-confirm" type="password" value={form.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} autoComplete="new-password" required />
                        </div>

                        <button className="signup-submit" type="submit" disabled={!canSubmit}>
                            {submitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản & liên kết'}
                        </button>
                    </form>
                )}
            </main>
        </AppShell>
    );
}
