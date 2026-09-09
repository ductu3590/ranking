'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppShell from '@/components/pickhub/AppShell';
import ClubSettings from '@/app/admin/ClubSettings';
import './admin-center.css';

export default function ClubSettingsPage() {
    return (
        <Suspense fallback={<div className="admin-center-loading">Đang tải cấu hình CLB…</div>}>
            <ClubSettingsPageContent />
        </Suspense>
    );
}

// Hai section cu da duoc go: roster ve /thanh-vien, fund ve /quy.
const LEGACY_SECTION_TARGET = {
    roster: '/thanh-vien',
    fund: '/quy',
};

function ClubSettingsPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const legacySection = searchParams.get('section');
    const legacyTarget = LEGACY_SECTION_TARGET[legacySection] || null;
    const [access, setAccess] = useState({ kind: 'loading' });

    useEffect(() => {
        if (legacyTarget) {
            router.replace(legacyTarget);
            return undefined;
        }
        let active = true;
        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                if (!active) return;
                setAccess({ kind: payload.permissions?.canManageSettings ? 'ready' : 'forbidden' });
            })
            .catch(() => { if (active) setAccess({ kind: 'error' }); });
        return () => { active = false; };
    }, [legacyTarget, router]);

    if (legacyTarget) {
        return <AppShell><div className="admin-center-loading">Đang chuyển hướng…</div></AppShell>;
    }

    return (
        <AppShell>
            <div className="admin-center-shell">
                <main className="admin-center">
                    <section className="admin-center-heading">
                        <div>
                            <p className="admin-center-eyebrow">Quản trị</p>
                            <h1>Cấu hình CLB</h1>
                            <p>Thông tin nhận diện, mã truy cập, mật khẩu và kết nối thu quỹ của câu lạc bộ.</p>
                        </div>
                    </section>

                    {access.kind === 'loading' ? <AdminAccessState title="Đang xác thực quyền" message="Máy chủ đang kiểm tra phiên trưởng nhóm…" />
                        : access.kind === 'forbidden' ? <AdminAccessState title="Không có quyền quản trị" message="Hãy nhập Mã CLB và mật khẩu trưởng nhóm để mở Cấu hình." action />
                        : access.kind === 'error' ? <AdminAccessState title="Chưa kiểm tra được quyền" message="Không thể kết nối máy chủ. Vui lòng tải lại trang." />
                        : <ClubSettings />}
                </main>
            </div>
        </AppShell>
    );
}

function AdminAccessState({ title, message, action = false }) {
    return <section className="admin-access-state" role="alert"><span aria-hidden="true">{action ? '!' : '◌'}</span><h2>{title}</h2><p>{message}</p>{action && <a href="/">Nhập lại thông tin CLB</a>}</section>;
}
