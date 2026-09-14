'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/pickhub/AppShell';
import './page.css';

const MEMBERSHIP_STATUS_LABEL = { active: 'Đang sinh hoạt', ended: 'Đã rời CLB' };

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN');
}

function initials(name) {
    return String(name || 'VĐV')
        .split(/\s+/)
        .filter(Boolean)
        .slice(-2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

export default function AthleteProfilePage() {
    const [state, setState] = useState({ kind: 'loading' });
    const [contact, setContact] = useState({ email: '', phone: '', facebookProfileUrl: '' });
    const [contactState, setContactState] = useState({ kind: 'idle', message: '' });

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const response = await fetch('/api/identity/athlete-profile', {
                    cache: 'no-store',
                    signal: controller.signal,
                });
                const payload = await response.json();
                if (response.status === 401) {
                    setState({ kind: 'anonymous', message: payload.error || 'Bạn cần đăng nhập.' });
                    return;
                }
                if (!response.ok) throw new Error(payload.error || 'Không tải được hồ sơ.');
                setContact({
                    email: payload.profile.account?.email || '',
                    phone: payload.profile.account?.phone || '',
                    facebookProfileUrl: payload.profile.account?.facebookProfileUrl || '',
                });
                setState({ kind: 'ready', profile: payload.profile });
            } catch (error) {
                if (error.name !== 'AbortError') setState({ kind: 'error', message: error.message });
            }
        }
        load();
        return () => controller.abort();
    }, []);

    async function saveContact(event) {
        event.preventDefault();
        setContactState({ kind: 'saving', message: '' });
        try {
            const response = await fetch('/api/identity/athlete-profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(contact),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Không thể lưu thông tin liên hệ.');
            setContact({
                email: payload.contact.email || '',
                phone: payload.contact.phone || '',
                facebookProfileUrl: payload.contact.facebookProfileUrl || '',
            });
            setState((current) => (
                current.kind === 'ready'
                    ? {
                        ...current,
                        profile: {
                            ...current.profile,
                            account: { ...current.profile.account, ...payload.contact },
                        },
                    }
                    : current
            ));
            setContactState({ kind: 'saved', message: 'Đã lưu thông tin liên hệ.' });
        } catch (error) {
            setContactState({
                kind: 'error',
                message: error.message || 'Không thể lưu thông tin liên hệ.',
            });
        }
    }


    if (state.kind !== 'ready') {
        const anonymous = state.kind === 'anonymous';
        return (
            <AppShell>
                <main className="profile-page">
                    <section className="profile-card profile-state" role={state.kind === 'loading' ? 'status' : 'alert'}>
                        <h1>
                            {state.kind === 'loading'
                                ? 'Đang tải hồ sơ'
                                : anonymous
                                    ? 'Chưa đăng nhập'
                                    : 'Không tải được hồ sơ'}
                        </h1>
                        <p>{state.kind === 'loading' ? 'Vui lòng đợi trong giây lát…' : state.message}</p>
                        {anonymous && (
                            <a className="profile-button profile-button--primary" href="/dang-nhap-vdv">
                                Đăng nhập
                            </a>
                        )}
                    </section>
                </main>
            </AppShell>
        );
    }

    const { account, club, athlete, membership } = state.profile;
    const displayName = athlete?.displayName || account.displayName || 'VĐV';
    const storageReady = account.contactStorageReady !== false;

    return (
        <AppShell>
            <main className="profile-page">
                <header className="profile-head">
                    <div>
                        <span>Hồ sơ cá nhân</span>
                        <h1>Thông tin của tôi</h1>
                        <p>Quản lý thông tin liên hệ để BTC giải đấu xác thực VĐV khi bạn tham gia giải.</p>
                    </div>
                    {club?.code && (
                        <div className="profile-club-code">
                            <span>Mã truy cập CLB</span>
                            <strong>{club.code}</strong>
                        </div>
                    )}
                </header>

                <section className="profile-card profile-identity-card">
                    <span className="profile-avatar" aria-hidden="true">{initials(displayName)}</span>
                    <div className="profile-identity-main">
                        <span className="profile-kicker">Tài khoản VĐV</span>
                        <h2>{displayName}</h2>
                        <p>
                            Tên đăng nhập:{' '}
                            <strong>{account.login}</strong>
                        </p>
                    </div>
                    <dl className="profile-facts">
                        <div>
                            <dt>CLB đang sinh hoạt</dt>
                            <dd>{club?.name || 'Chưa xác định'}</dd>
                        </div>
                        <div>
                            <dt>Trạng thái</dt>
                            <dd className="profile-status">{MEMBERSHIP_STATUS_LABEL[membership?.status] || '—'}</dd>
                        </div>
                        <div>
                            <dt>Tên trong CLB</dt>
                            <dd>{membership?.alias || '—'}</dd>
                        </div>
                        <div>
                            <dt>Tham gia từ</dt>
                            <dd>{formatDate(membership?.effectiveFrom)}</dd>
                        </div>
                    </dl>
                </section>

                <div className="profile-content-grid">
                    <section className="profile-card profile-contact-card">
                        <div>
                            <span className="profile-kicker">Chỉ mình bạn xem</span>
                            <h2>Thông tin liên hệ</h2>
                            <p className="profile-description">
                                Email, số điện thoại và link Facebook dùng để BTC giải đấu xác thực VĐV.
                                Các thông tin này không xuất hiện trong danh bạ hay hồ sơ thành viên của CLB.
                            </p>
                        </div>
                        {!storageReady ? (
                            <p className="profile-callout" role="alert">
                                Chức năng lưu liên hệ đang được cập nhật. Vui lòng thử lại sau.
                            </p>
                        ) : (
                            <form className="profile-contact-form" onSubmit={saveContact}>
                                <label>
                                    Email
                                    <input
                                        type="email"
                                        value={contact.email}
                                        maxLength={254}
                                        onChange={(event) => setContact((value) => ({ ...value, email: event.target.value }))}
                                        placeholder="email@cuaban.vn"
                                    />
                                </label>
                                <label>
                                    Số điện thoại
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={contact.phone}
                                        onChange={(event) => setContact((value) => ({ ...value, phone: event.target.value }))}
                                        placeholder="Ví dụ: 0901234567"
                                    />
                                </label>
                                <label>
                                    Link profile Facebook
                                    <input
                                        type="url"
                                        value={contact.facebookProfileUrl}
                                        maxLength={500}
                                        onChange={(event) => setContact((value) => ({ ...value, facebookProfileUrl: event.target.value }))}
                                        placeholder="https://www.facebook.com/ten-cua-ban"
                                    />
                                </label>
                                {contactState.kind !== 'idle' && (
                                    <p
                                        className={`profile-form-message profile-form-message--${contactState.kind}`}
                                        role={contactState.kind === 'error' ? 'alert' : 'status'}
                                    >
                                        {contactState.kind === 'saving' ? 'Đang lưu…' : contactState.message}
                                    </p>
                                )}
                                <button
                                    className="profile-button profile-button--primary"
                                    type="submit"
                                    disabled={contactState.kind === 'saving'}
                                >
                                    {contactState.kind === 'saving' ? 'Đang lưu…' : 'Lưu thông tin'}
                                </button>
                            </form>
                        )}
                    </section>

                    <aside className="profile-card profile-club-card">
                        <span className="profile-kicker">CLB của tôi</span>
                        <h2>{club?.name || 'Chưa xác định CLB'}</h2>
                        <p>Hồ sơ này đang gắn với membership hiện tại của bạn trong CLB.</p>
                        <div className="profile-club-details">
                            <span>Membership #{membership?.id || '—'}</span>
                            {membership?.effectiveTo && (
                                <span>Rời CLB: {formatDate(membership.effectiveTo)}</span>
                            )}
                        </div>
                        <div className="profile-links">
                            {membership?.id && (
                                <a href={`/thanh-vien/${membership.id}`}>
                                    Xem hồ sơ trong danh bạ CLB
                                    <span>→</span>
                                </a>
                            )}
                            <a href="/bxh">
                                Bảng xếp hạng đóng góp
                                <span>→</span>
                            </a>
                            <a href="/giai-dau">
                                Giải đấu của CLB
                                <span>→</span>
                            </a>
                        </div>
                    </aside>
                </div>

            </main>
        </AppShell>
    );
}
