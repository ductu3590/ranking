'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/pickhub/AppShell';
import './page.css';

// "Thông tin" là lối tắt hồ sơ cá nhân. Membership không được lấy từ danh bạ hoặc
// query string: chỉ athlete_session đã đối chiếu DB mới quyết định URL đích.
export default function MemberInformationPage() {
    const router = useRouter();
    const [state, setState] = useState({ kind: 'loading', message: 'Đang mở hồ sơ của bạn…' });

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/identity/athlete-sessions', { cache: 'no-store', signal: controller.signal })
            .then(async (response) => {
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Không thể kiểm tra phiên đăng nhập.');
                const membershipId = payload?.account?.membershipId;
                if (!membershipId) {
                    setState({ kind: 'anonymous', message: 'Bạn cần đăng nhập bằng tài khoản VĐV để xem hồ sơ của mình.' });
                    return;
                }
                router.replace(`/thanh-vien/${encodeURIComponent(membershipId)}`);
            })
            .catch((error) => {
                if (error.name !== 'AbortError') setState({ kind: 'error', message: error.message || 'Không thể mở hồ sơ.' });
            });
        return () => controller.abort();
    }, [router]);

    return (
        <AppShell>
            <div className="member-info-page-shell">
                <main className="member-info-page">
                    <StatePanel
                        kind={state.kind}
                        title={state.kind === 'loading' ? 'Đang mở hồ sơ' : state.kind === 'anonymous' ? 'Chưa đăng nhập tài khoản VĐV' : 'Chưa mở được hồ sơ'}
                        message={state.message}
                        action={state.kind === 'anonymous' ? 'Đăng nhập tài khoản VĐV' : state.kind === 'error' ? 'Tải lại trang' : null}
                    />
                </main>
            </div>
        </AppShell>
    );
}

function StatePanel({ kind, title, message, action }) {
    const href = kind === 'anonymous' ? '/dang-nhap-vdv' : '/thong-tin';
    return <section className={`member-info-state is-${kind}`} role={kind === 'error' || kind === 'anonymous' ? 'alert' : 'status'}><span aria-hidden="true">{kind === 'loading' ? '◌' : '!'}</span><h2>{title}</h2><p>{message}</p>{action && <a href={href}>{action}</a>}</section>;
}
