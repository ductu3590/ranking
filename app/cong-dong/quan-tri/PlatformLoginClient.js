'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLE_LABELS = { community_admin: 'Quản trị cộng đồng', platform_admin: 'Quản trị hệ thống' };

function retryText(response) {
  const seconds = Math.max(1, Number(response.headers.get('Retry-After')) || 60);
  const wait = seconds >= 60 ? `${Math.ceil(seconds / 60)} phút` : `${seconds} giây`;
  return `Bạn thử quá nhiều lần. Vui lòng thử lại sau ${wait}.`;
}

function ShieldIcon() {
  return (
    <svg className="cd-shield" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export default function PlatformLoginClient({ signedInRole }) {
  const router = useRouter();
  const [form, setForm] = useState({ login: '', password: '' });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/platform/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      if (response.status === 429) setError(retryText(response));
      else if (response.status === 401) setError('Tên đăng nhập hoặc mật khẩu không đúng.');
      else setError('Không đăng nhập được. Vui lòng thử lại.');
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    }
    setBusy(false);
  }

  async function logout() {
    setBusy(true);
    await fetch('/api/platform/session/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    router.refresh();
    setBusy(false);
  }

  if (signedInRole) {
    return (
      <section className="cd-card cd-card--narrow" aria-labelledby="cd-admin-title">
        <ShieldIcon />
        <h1 id="cd-admin-title" className="cd-title">Đã đăng nhập quản trị</h1>
        <p className="cd-lead">Vai trò: {ROLE_LABELS[signedInRole] || signedInRole}</p>
        <p className="cd-legal">Danh sách giải cộng đồng và bảng duyệt đăng ký sẽ có ở bản cập nhật tiếp theo.</p>
        <button type="button" className="cd-btn cd-btn--ghost cd-btn--block" onClick={logout} disabled={busy}>Đăng xuất</button>
      </section>
    );
  }

  return (
    <section className="cd-card cd-card--narrow" aria-labelledby="cd-admin-title">
      <ShieldIcon />
      <h1 id="cd-admin-title" className="cd-title">Đăng nhập quản trị</h1>
      <p className="cd-lead">Chỉ dành cho tài khoản do PickHub cấp</p>
      {error ? <p className="cd-alert" role="alert">{error}</p> : null}
      <form className="cd-form" onSubmit={submit}>
        <div className="cd-field">
          <label htmlFor="cd-admin-login">Tên đăng nhập</label>
          <input id="cd-admin-login" name="login" type="text" autoComplete="username" required
            value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
        </div>
        <div className="cd-field">
          <label htmlFor="cd-admin-password">Mật khẩu</label>
          <div className="cd-password">
            <input id="cd-admin-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="cd-password__toggle" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
              {visible ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
        </div>
        <button type="submit" className="cd-btn cd-btn--primary cd-btn--block" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </section>
  );
}
