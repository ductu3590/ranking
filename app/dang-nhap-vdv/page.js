'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/pickhub/AppShell';
import './page.css';

export default function AthleteLoginPage() {
    const [form, setForm] = useState({ login: '', password: '' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [checking, setChecking] = useState(true);

    // Đã đăng nhập rồi thì vào thẳng hồ sơ, không bắt nhập lại.
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/identity/athlete-sessions', { cache: 'no-store', signal: controller.signal })
            .then((response) => response.json())
            .then((payload) => {
                if (payload?.account) window.location.replace('/ho-so-vdv');
                else setChecking(false);
            })
            .catch((cause) => {
                if (cause.name !== 'AbortError') setChecking(false);
            });
        return () => controller.abort();
    }, []);

    function update(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(event) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            const response = await fetch('/api/identity/athlete-sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login: form.login, password: form.password }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Không thể đăng nhập.');
            window.location.assign('/ho-so-vdv');
        } catch (cause) {
            setError(cause.message);
            setSubmitting(false);
        }
    }

    const canSubmit = form.login.trim() && form.password && !submitting;

    return (
        <AppShell>
            <main className="signup-page">
                <header className="signup-head">
                    <span>Tài khoản VĐV</span>
                    <h1>Đăng nhập</h1>
                    <p>Dùng tên đăng nhập và mật khẩu bạn đã tạo khi liên kết hồ sơ VĐV của mình.</p>
                </header>

                {checking ? (
                    <section className="signup-card" role="status">
                        <p style={{ margin: 0, color: 'var(--ph-muted)' }}>Đang kiểm tra phiên đăng nhập…</p>
                    </section>
                ) : (
                    <form className="signup-card" onSubmit={submit}>
                        {error && <p className="signup-alert is-error" role="alert">{error}</p>}

                        <div className="signup-field">
                            <label htmlFor="login-name">Tên đăng nhập</label>
                            <input
                                id="login-name"
                                value={form.login}
                                onChange={(event) => update('login', event.target.value.toLowerCase())}
                                autoComplete="username"
                                autoCapitalize="none"
                                required
                            />
                        </div>

                        <div className="signup-field">
                            <label htmlFor="login-password">Mật khẩu</label>
                            <input
                                id="login-password"
                                type="password"
                                value={form.password}
                                onChange={(event) => update('password', event.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        <button className="signup-submit" type="submit" disabled={!canSubmit}>
                            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
                        </button>

                        <p className="login-hint">
                            Chưa có tài khoản? <a href="/dang-ky">Đăng ký &amp; liên kết hồ sơ VĐV</a>
                        </p>
                    </form>
                )}
            </main>
        </AppShell>
    );
}
