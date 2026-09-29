'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const LOGIN_URL = '/cong-dong/tai-khoan?tab=dang-nhap&next=%2Fcong-dong%2Ftai-khoan%2Fho-so';

async function patchProfile(body) {
  const response = await fetch('/api/player/profile', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export default function ProfileClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ displayName: '', gender: '', dob: '', selfDeclaredPhr: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState({ tone: '', text: '' });

  useEffect(() => {
    let alive = true;
    fetch('/api/player/profile', { credentials: 'same-origin' })
      .then(async (response) => {
        if (response.status === 401) { router.replace(LOGIN_URL); return null; }
        return response.json();
      })
      .then((data) => {
        if (!alive || !data?.account) return;
        const account = data.account;
        setForm({
          displayName: account.displayName || '',
          gender: account.gender || '',
          dob: account.dob || '',
          selfDeclaredPhr: account.selfDeclaredPhr == null ? '' : String(account.selfDeclaredPhr),
        });
        setLoading(false);
      })
      .catch(() => { if (alive) { setNotice({ tone: 'error', text: 'Không tải được hồ sơ. Vui lòng thử lại.' }); setLoading(false); } });
    return () => { alive = false; };
  }, [router]);

  async function saveProfile(event) {
    event.preventDefault();
    if (busy) return;
    setBusy('profile');
    setNotice({ tone: '', text: '' });
    const { ok, status, data } = await patchProfile({
      displayName: form.displayName, gender: form.gender, dob: form.dob, selfDeclaredPhr: form.selfDeclaredPhr,
    });
    setBusy('');
    if (status === 401) { router.replace(LOGIN_URL); return; }
    setNotice(ok ? { tone: 'ok', text: 'Đã lưu thay đổi.' } : { tone: 'error', text: data?.error || 'Không lưu được. Vui lòng thử lại.' });
  }

  async function changePassword(event) {
    event.preventDefault();
    if (busy) return;
    if (passwords.newPassword !== passwords.confirm) {
      setNotice({ tone: 'error', text: 'Mật khẩu nhập lại không khớp.' });
      return;
    }
    setBusy('password');
    setNotice({ tone: '', text: '' });
    const { ok, status, data } = await patchProfile({
      currentPassword: passwords.currentPassword, newPassword: passwords.newPassword,
    });
    setBusy('');
    if (status === 401 && data?.code === 'PLAYER_SESSION_REQUIRED') { router.replace(LOGIN_URL); return; }
    if (ok) {
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      setNotice({ tone: 'ok', text: 'Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.' });
      return;
    }
    setNotice({ tone: 'error', text: status === 401 ? 'Mật khẩu hiện tại không đúng.' : (data?.error || 'Không đổi được mật khẩu.') });
  }

  async function logout() {
    setBusy('logout');
    await fetch('/api/player/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    router.replace('/cong-dong/tai-khoan?tab=dang-nhap');
  }

  if (loading) return <section className="cd-card" aria-busy="true"><p className="cd-lead">Đang tải hồ sơ…</p></section>;

  return (
    <div className="cd-stack">
      <section className="cd-card" aria-labelledby="cd-profile-title">
        <h1 id="cd-profile-title" className="cd-title">Hồ sơ VĐV</h1>
        <p className="cd-lead">Thông tin dùng khi bạn đăng ký giải cộng đồng</p>
        {notice.text ? <p className={notice.tone === 'ok' ? 'cd-notice' : 'cd-alert'} role={notice.tone === 'ok' ? 'status' : 'alert'}>{notice.text}</p> : null}
        <form className="cd-form" onSubmit={saveProfile}>
          <div className="cd-field">
            <label htmlFor="cd-p-name">Tên hiển thị</label>
            <input id="cd-p-name" type="text" maxLength={60} required value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <fieldset className="cd-field cd-field--group">
            <legend>Giới tính</legend>
            <div className="cd-segment">
              {[['', 'Chưa chọn'], ['male', 'Nam'], ['female', 'Nữ']].map(([value, label]) => (
                <label key={value || 'none'} className="cd-segment__item" data-active={form.gender === value}>
                  <input type="radio" name="gender" value={value} checked={form.gender === value}
                    onChange={() => setForm({ ...form, gender: value })} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="cd-field">
            <label htmlFor="cd-p-dob">Ngày sinh</label>
            <input id="cd-p-dob" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </div>
          <div className="cd-field">
            <label htmlFor="cd-p-phr">Trình độ PHR tự khai</label>
            <input id="cd-p-phr" type="number" inputMode="decimal" step="0.05" min="0" max="10" value={form.selfDeclaredPhr}
              onChange={(e) => setForm({ ...form, selfDeclaredPhr: e.target.value })} />
          </div>
          <button type="submit" className="cd-btn cd-btn--primary cd-btn--block" disabled={busy === 'profile'}>
            {busy === 'profile' ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </form>
      </section>

      <section className="cd-card" aria-labelledby="cd-password-title">
        <h2 id="cd-password-title" className="cd-subtitle">Đổi mật khẩu</h2>
        <form className="cd-form" onSubmit={changePassword}>
          <div className="cd-field">
            <label htmlFor="cd-p-current">Mật khẩu hiện tại</label>
            <input id="cd-p-current" type="password" autoComplete="current-password" required value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} />
          </div>
          <div className="cd-field">
            <label htmlFor="cd-p-new">Mật khẩu mới</label>
            <input id="cd-p-new" type="password" autoComplete="new-password" required minLength={8} value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} />
            <p className="cd-hint">Tối thiểu 8 ký tự</p>
          </div>
          <div className="cd-field">
            <label htmlFor="cd-p-confirm">Nhập lại mật khẩu mới</label>
            <input id="cd-p-confirm" type="password" autoComplete="new-password" required value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} />
          </div>
          <button type="submit" className="cd-btn cd-btn--secondary cd-btn--block" disabled={busy === 'password'}>
            {busy === 'password' ? 'Đang đổi…' : 'Đổi mật khẩu'}
          </button>
        </form>
      </section>

      <button type="button" className="cd-btn cd-btn--ghost cd-btn--block" onClick={logout} disabled={busy === 'logout'}>Đăng xuất</button>
    </div>
  );
}
