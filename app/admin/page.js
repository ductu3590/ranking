'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import HomeHeader from '@/components/HomeHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import FundAdminPage from '@/app/quy/admin/page';
import ClubSettings from '@/app/admin/ClubSettings';
import MembersPage from '@/app/quy/members/page';
import './admin-center.css';

export default function UnifiedAdminCenter() {
    return (
        <Suspense fallback={<div className="admin-center-loading">Đang tải trung tâm quản trị...</div>}>
            <UnifiedAdminCenterContent />
        </Suspense>
    );
}

function UnifiedAdminCenterContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const section = searchParams.get('section') || 'fund';
    const [access, setAccess] = useState({ kind: 'loading', permissions: {} });

    useEffect(() => {
        let active = true;
        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                if (!active) return;
                if (payload.permissions?.canManageSettings) setAccess({ kind: 'ready', permissions: payload.permissions });
                else setAccess({ kind: 'forbidden', permissions: payload.permissions || {} });
            })
            .catch(() => { if (active) setAccess({ kind: 'error', permissions: {} }); });
        return () => { active = false; };
    }, []);

    function setSection(nextSection) {
        router.push(`/admin?section=${nextSection}`);
    }

    return (
        <div className="admin-center-shell">
            <HomeHeader />

            <main className="admin-center">
                <section className="admin-center-heading">
                    <div>
                        <p className="admin-center-eyebrow">Quản trị</p>
                        <h1>Trung tâm quản trị CLB</h1>
                        <p>Quản lý quỹ và thành viên CLB. Giải đấu quản lý ở mục riêng trên thanh menu.</p>
                    </div>
                </section>

                {access.kind === 'ready' && <nav className="admin-center-tabs" aria-label="Khu vực quản trị">
                    <button
                        type="button"
                        className={section === 'roster' ? 'active' : ''}
                        onClick={() => setSection('roster')}
                    >
                        Thành viên &amp; PHR
                    </button>
                    <button
                        type="button"
                        className={section === 'fund' ? 'active' : ''}
                        onClick={() => setSection('fund')}
                    >
                        Quỹ
                    </button>
                    <button
                        type="button"
                        className={section === 'settings' ? 'active' : ''}
                        onClick={() => setSection('settings')}
                    >
                        Cài đặt
                    </button>
                </nav>}

                {access.kind === 'loading' ? <AdminAccessState title="Đang xác thực quyền" message="Máy chủ đang kiểm tra phiên trưởng nhóm…" />
                    : access.kind === 'forbidden' ? <AdminAccessState title="Không có quyền quản trị" message="Hãy nhập Mã CLB và mật khẩu trưởng nhóm để mở Cấu hình." action />
                    : access.kind === 'error' ? <AdminAccessState title="Chưa kiểm tra được quyền" message="Không thể kết nối máy chủ. Vui lòng tải lại trang." />
                    : section === 'fund' ? <FundAdminPage embedded />
                    : section === 'roster' ? <MembersPage embedded />
                    : section === 'settings' && (
                    <section className="admin-center-panel">
                        <ClubSettings />
                    </section>
                )}
            </main>

            <MobileBottomNav />
        </div>
    );
}

function AdminAccessState({ title, message, action = false }) {
    return <section className="admin-access-state" role="alert"><span aria-hidden="true">{action ? '!' : '◌'}</span><h2>{title}</h2><p>{message}</p>{action && <a href="/">Nhập lại thông tin CLB</a>}</section>;
}
