'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeNext } from '@/lib/domain/identity/safeNext';

const TABS = [
  { key: 'tao', label: 'Tạo tài khoản' },
  { key: 'dang-nhap', label: 'Đăng nhập' },
];

async function callApi(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function Field({ id, label, hint, children }) {
  return (
    <div className="cd-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <p className="cd-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, describedBy }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="cd-password">
      <input
        id={id}
        name={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        required
      />
      <button type="button" className="cd-password__toggle" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
        {visible ? 'Ẩn' : 'Hiện'}
      </button>
    </div>
  );
}

export default function AccountClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [tab, setTab] = useState(params.get('tab') === 'dang-nhap' ? 'dang-nhap' : 'tao');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signup, setSignup] = useState({
    displayName: '', phone: '', password: '', confirm: '', gender: '', dob: '', selfDeclaredPhr: '', company: '',
  });
  const [login, setLogin] = useState({ phone: '', password: '' });

  // Đã đăng nhập sẵn thì đi tiếp luôn, không bắt điền lại.
  useEffect(() => {
    let alive = true;
    fetch('/api/player/session', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data) => { if (alive && data?.account) router.replace(next); })
      .catch(() => {});
    return () => { alive = false; };
  }, [router, next]);

  function switchTab(key) {
    setTab(key);
    setError('');
    // Giữ ?tab= trên URL và báo thanh trên (nút góc phải là hành động ngược với tab đang mở).
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);
    window.history.replaceState(null, '', url.toString());
    window.dispatchEvent(new CustomEvent('cd:accounttab', { detail: key }));
  }

  async function submitSignup(event) {
    event.preventDefault();
    if (busy) return;
    if (signup.password !== signup.confirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setBusy(true);
    setError('');
    const { ok, data } = await callApi('/api/player/accounts', {
      displayName: signup.displayName,
      phone: signup.phone,
      password: signup.password,
      gender: signup.gender,
      dob: signup.dob,
      selfDeclaredPhr: signup.selfDeclaredPhr,
      company: signup.company,
    });
    if (ok) {
      router.replace(next);
      return;
    }
    setError(data?.error || 'Không tạo được tài khoản. Vui lòng thử lại.');
    setBusy(false);
  }

  async function submitLogin(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const { ok, data } = await callApi('/api/player/session', { phone: login.phone, password: login.password });
    if (ok) {
      router.replace(next);
      return;
    }
    setError(data?.error || 'Số điện thoại hoặc mật khẩu không đúng.');
    setBusy(false);
  }

  return (
    <section className="cd-card" aria-labelledby="cd-account-title">
      <div className="cd-tabs" role="tablist" aria-label="Tài khoản VĐV">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`cd-tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`cd-panel-${item.key}`}
            className="cd-tab"
            onClick={() => switchTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className="cd-alert" role="alert">{error}</p> : null}

      {tab === 'tao' ? (
        <form id="cd-panel-tao" role="tabpanel" aria-labelledby="cd-tab-tao" className="cd-form" onSubmit={submitSignup} noValidate={false}>
          <h1 id="cd-account-title" className="cd-title">Tạo tài khoản VĐV</h1>
          <p className="cd-lead">Dùng để đăng ký giải cộng đồng và rủ bạn ghép cặp</p>

          <Field id="cd-name" label="Tên hiển thị">
            <input
              id="cd-name" name="displayName" type="text" maxLength={60} autoComplete="name" required
              placeholder="Ví dụ: Nguyễn Minh"
              value={signup.displayName} onChange={(e) => setSignup({ ...signup, displayName: e.target.value })}
            />
          </Field>
          <Field id="cd-phone" label="Số điện thoại" hint="Dùng để đăng nhập, không hiển thị công khai">
            <input
              id="cd-phone" name="phone" type="tel" inputMode="tel" autoComplete="username" required
              placeholder="0912 345 678" aria-describedby="cd-phone-hint"
              value={signup.phone} onChange={(e) => setSignup({ ...signup, phone: e.target.value })}
            />
          </Field>
          <Field id="cd-password" label="Mật khẩu" hint="Tối thiểu 8 ký tự">
            <PasswordInput id="cd-password" value={signup.password} autoComplete="new-password" describedBy="cd-password-hint"
              onChange={(value) => setSignup({ ...signup, password: value })} />
          </Field>
          <Field id="cd-confirm" label="Nhập lại mật khẩu">
            <PasswordInput id="cd-confirm" value={signup.confirm} autoComplete="new-password"
              onChange={(value) => setSignup({ ...signup, confirm: value })} />
          </Field>

          <details className="cd-more">
            <summary>Thông tin thêm (không bắt buộc)</summary>
            <fieldset className="cd-field cd-field--group">
              <legend>Giới tính</legend>
              <div className="cd-segment">
                {[['male', 'Nam'], ['female', 'Nữ']].map(([value, label]) => (
                  <label key={value} className="cd-segment__item" data-active={signup.gender === value}>
                    <input
                      type="radio" name="gender" value={value} checked={signup.gender === value}
                      onChange={() => setSignup({ ...signup, gender: value })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id="cd-dob" label="Ngày sinh">
              <input id="cd-dob" name="dob" type="date" autoComplete="bday" value={signup.dob}
                onChange={(e) => setSignup({ ...signup, dob: e.target.value })} />
            </Field>
            <Field id="cd-phr" label="Trình độ PHR tự khai">
              <input id="cd-phr" name="selfDeclaredPhr" type="number" inputMode="decimal" step="0.05" min="0" max="10"
                placeholder="Ví dụ: 3.25" value={signup.selfDeclaredPhr}
                onChange={(e) => setSignup({ ...signup, selfDeclaredPhr: e.target.value })} />
            </Field>
          </details>

          <div className="cd-honeypot" aria-hidden="true">
            <label htmlFor="cd-company">Công ty</label>
            <input id="cd-company" name="company" type="text" tabIndex={-1} autoComplete="off"
              value={signup.company} onChange={(e) => setSignup({ ...signup, company: e.target.value })} />
          </div>

          <button type="submit" className="cd-btn cd-btn--primary cd-btn--block" disabled={busy}>
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
          <p className="cd-switch">
            Đã có tài khoản?{' '}
            <button type="button" className="cd-linkbtn" onClick={() => switchTab('dang-nhap')}>Đăng nhập</button>
          </p>
          <p className="cd-legal">Bằng việc tạo tài khoản, bạn đồng ý cho ban tổ chức xem số điện thoại để liên hệ về giải.</p>
        </form>
      ) : (
        <form id="cd-panel-dang-nhap" role="tabpanel" aria-labelledby="cd-tab-dang-nhap" className="cd-form" onSubmit={submitLogin}>
          <h1 id="cd-account-title" className="cd-title">Đăng nhập</h1>
          <p className="cd-lead">Đăng nhập để đăng ký giải và xem đơn của bạn</p>

          <Field id="cd-login-phone" label="Số điện thoại">
            <input
              id="cd-login-phone" name="phone" type="tel" inputMode="tel" autoComplete="username" required
              placeholder="0912 345 678"
              value={login.phone} onChange={(e) => setLogin({ ...login, phone: e.target.value })}
            />
          </Field>
          <Field id="cd-login-password" label="Mật khẩu">
            <PasswordInput id="cd-login-password" value={login.password} autoComplete="current-password"
              onChange={(value) => setLogin({ ...login, password: value })} />
          </Field>

          <button type="submit" className="cd-btn cd-btn--primary cd-btn--block" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
          <p className="cd-switch">
            Chưa có tài khoản?{' '}
            <button type="button" className="cd-linkbtn" onClick={() => switchTab('tao')}>Tạo tài khoản</button>
          </p>
          <p className="cd-legal">Quên mật khẩu? Liên hệ ban tổ chức giải để được đặt lại.</p>
        </form>
      )}
    </section>
  );
}
