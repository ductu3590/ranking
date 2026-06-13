'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import './login.css';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    async function handleLogin(e) {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            // Multi-club admins: resolve their club and set the group_session cookie.
            const res = await fetch('/api/groups/session/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: data.session.access_token }),
            });
            if (res.ok) {
                const payload = await res.json();
                window.localStorage.setItem(
                    'teamfund-current-group',
                    JSON.stringify({ ...payload.group, role: 'admin' })
                );
                router.push(payload.redirectTo || '/admin');
                return;
            }

            // Fallback: legacy Supabase-metadata roles (e.g. tournament captain).
            const userRole = data.user?.user_metadata?.role;
            if (userRole === 'captain') {
                router.push('/tournament/captain');
            } else {
                router.push('/admin');
            }
        } catch (error) {
            setError(error.message || 'Đăng nhập thất bại');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1>🎾 Admin Login</h1>
                    <p>Quản lý Quỹ Pickleball</p>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                    {error && (
                        <div className="error-message">
                            ⚠️ {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@example.com"
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label>Mật khẩu</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            disabled={loading}
                        />
                    </div>

                    <button type="submit" className="btn-login" disabled={loading}>
                        {loading ? '⏳ Đang đăng nhập...' : '🔐 Đăng nhập'}
                    </button>
                </form>

                <div className="login-footer">
                    <a href="/" className="link-home">← Về trang chủ</a>
                </div>
            </div>
        </div>
    );
}
