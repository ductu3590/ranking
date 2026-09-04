'use client';

import { useEffect, useMemo, useState } from 'react';
import HomeHeader from '@/components/HomeHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import MemberInfoPanel from '@/components/pickhub/MemberInfoPanel';
import './page.css';

export default function MemberInformationPage() {
    const [state, setState] = useState({ kind: 'loading', message: 'Đang tải thông tin CLB…' });
    const [roster, setRoster] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [assessments, setAssessments] = useState([]);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const sessionResponse = await fetch('/api/groups/session', { cache: 'no-store', signal: controller.signal });
                const sessionView = await sessionResponse.json();
                if (!sessionView.permissions?.canViewClub) {
                    setState({ kind: 'forbidden', message: 'Phiên CLB không hợp lệ hoặc đã hết hạn.' });
                    return;
                }
                if (sessionView.session?.role !== 'member') {
                    setState({ kind: 'forbidden', message: 'Trang Thông tin dành cho trải nghiệm thành viên. Trưởng nhóm dùng mục Cấu hình.' });
                    return;
                }
                const rosterResponse = await fetch('/api/identity/roster', { cache: 'no-store', signal: controller.signal });
                const payload = await rosterResponse.json();
                if (!rosterResponse.ok) throw new Error(payload.error || 'Không thể tải hồ sơ thành viên.');
                const activeRoster = (payload.roster || []).filter((item) => item.status === 'active');
                setRoster(activeRoster);
                if (activeRoster.length === 0) setState({ kind: 'empty', message: 'CLB chưa có membership đang hoạt động.' });
                else {
                    setSelectedId(String(activeRoster[0].id));
                    setState({ kind: 'ready', message: '' });
                }
            } catch (error) {
                if (error.name !== 'AbortError') setState({ kind: 'error', message: error.message || 'Không thể tải thông tin.' });
            }
        }
        load();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        const controller = new AbortController();
        setAssessments([]);
        fetch(`/api/identity/assessments?membershipId=${encodeURIComponent(selectedId)}`, { cache: 'no-store', signal: controller.signal })
            .then(async (response) => {
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Không thể tải lịch sử PHR.');
                setAssessments(payload.assessments || []);
            })
            .catch((error) => {
                if (error.name !== 'AbortError') setState({ kind: 'error', message: error.message });
            });
        return () => controller.abort();
    }, [selectedId]);

    const membership = useMemo(() => roster.find((item) => String(item.id) === selectedId) || null, [roster, selectedId]);

    return (
        <div className="member-info-page-shell">
            <HomeHeader />
            <main className="member-info-page">
                <header className="member-info-heading">
                    <div><span>Hồ sơ athlete / membership</span><h1>Thông tin thành viên</h1><p>Phiên dùng chung không xác nhận bạn là VĐV nào. Hãy chọn đúng hồ sơ trong CLB để xem dữ liệu công khai phù hợp.</p></div>
                    {roster.length > 0 && <label>Hồ sơ đang xem<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{roster.map((item) => <option key={item.id} value={item.id}>{item.alias || item.athlete?.displayName}</option>)}</select></label>}
                </header>

                {state.kind === 'loading' ? <StatePanel kind="loading" title="Đang tải hồ sơ" message={state.message} />
                    : state.kind === 'forbidden' ? <StatePanel kind="forbidden" title="Không có quyền truy cập" message={state.message} action="Nhập lại Mã CLB + mật khẩu" />
                    : state.kind === 'error' ? <StatePanel kind="error" title="Chưa tải được thông tin" message={state.message} action="Tải lại trang" />
                    : state.kind === 'empty' ? <StatePanel kind="empty" title="Chưa có hồ sơ" message={state.message} />
                    : <MemberInfoPanel athleteMembership={membership} phrSnapshot={assessments[0] || null} assessmentHistory={assessments} privacyFlags={{ sharedSession: true }} />}
            </main>
            <MobileBottomNav />
        </div>
    );
}

function StatePanel({ kind, title, message, action }) {
    return <section className={`member-info-state is-${kind}`} role={kind === 'error' || kind === 'forbidden' ? 'alert' : 'status'}><span aria-hidden="true">{kind === 'loading' ? '◌' : kind === 'empty' ? '○' : '!'}</span><h2>{title}</h2><p>{message}</p>{action && <a href={kind === 'forbidden' ? '/' : '/thong-tin'}>{action}</a>}</section>;
}
