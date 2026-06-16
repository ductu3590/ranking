'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import HomeHeader from '@/components/HomeHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import FundAdminPage from '@/app/quy/admin/page';
import ClubSettings from '@/app/admin/ClubSettings';
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

                <nav className="admin-center-tabs" aria-label="Khu vực quản trị">
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
                </nav>

                {section === 'fund' && <FundAdminPage embedded />}
                {section === 'settings' && (
                    <section className="admin-center-panel">
                        <ClubSettings />
                    </section>
                )}
            </main>

            <MobileBottomNav />
        </div>
    );
}
