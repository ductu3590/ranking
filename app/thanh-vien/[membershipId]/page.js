'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import MemberProfileView from '@/components/pickhub/MemberProfileView';

export default function MemberProfilePage() {
    const params = useParams();
    const membershipId = String(params?.membershipId || '');
    const [state, setState] = useState({ kind: 'loading', message: 'Đang tải hồ sơ…' });
    const [membership, setMembership] = useState(null);
    const [assessments, setAssessments] = useState([]);
    const [showLinkCta, setShowLinkCta] = useState(false);

    useEffect(() => {
        if (!membershipId) return undefined;
        const controller = new AbortController();

        async function load() {
            try {
                // Quyền xem CLB đến từ group_session hoặc athlete_session; route session
                // đã gộp cả hai nhánh qua getClubReadContext.
                const [sessionResponse, athleteResponse] = await Promise.all([
                    fetch('/api/groups/session', { cache: 'no-store', signal: controller.signal }),
                    fetch('/api/identity/athlete-sessions', { cache: 'no-store', signal: controller.signal }),
                ]);
                const sessionView = await sessionResponse.json();
                if (!sessionView.permissions?.canViewClub) {
                    setState({ kind: 'forbidden', message: 'Bạn cần đăng nhập CLB hoặc tài khoản VĐV để xem hồ sơ này.' });
                    return;
                }

                const athletePayload = await athleteResponse.json().catch(() => ({}));
                const athleteAccount = athletePayload?.account || null;
                const isOwnProfile = athleteAccount
                    && Number(athleteAccount.membershipId) === Number(membershipId);

                // Đã có athlete_session thì không hỏi "Xác thực chính chủ" nữa.
                // Chỉ còn gợi ý liên kết khi đang xem bằng phiên CLB dùng chung.
                setShowLinkCta(!athleteAccount && sessionView.session?.role === 'member');

                const [rosterResponse, assessmentResponse] = await Promise.all([
                    fetch('/api/identity/roster', { cache: 'no-store', signal: controller.signal }),
                    fetch(`/api/identity/assessments?membershipId=${encodeURIComponent(membershipId)}`, { cache: 'no-store', signal: controller.signal }),
                ]);
                const rosterPayload = await rosterResponse.json();
                if (!rosterResponse.ok) throw new Error(rosterPayload.error || 'Không thể tải hồ sơ.');
                const found = (rosterPayload.roster || []).find((item) => String(item.id) === membershipId);
                if (!found) {
                    setState({ kind: 'empty', message: 'Không tìm thấy hồ sơ này trong CLB.' });
                    return;
                }
                setMembership({
                    ...found,
                    self: isOwnProfile || found.self === true,
                });
                const assessmentPayload = await assessmentResponse.json().catch(() => ({}));
                setAssessments(assessmentPayload.assessments || []);
                setState({ kind: 'ready', message: '' });
            } catch (error) {
                if (error.name !== 'AbortError') setState({ kind: 'error', message: error.message || 'Không tải được hồ sơ.' });
            }
        }

        load();
        return () => controller.abort();
    }, [membershipId]);

    return (
        <div className="member-info-page">
            <header className="member-info-heading">
                <div>
                    <span>Hồ sơ athlete / membership</span>
                    <h1>Thông tin thành viên</h1>
                    <p>Dữ liệu công khai của membership trong CLB.</p>
                </div>
                <a className="ph-btn ph-btn--outline" href="/thanh-vien">← Về danh bạ</a>
            </header>

            {state.kind === 'ready'
                ? <MemberProfileView
                    athleteMembership={membership}
                    phrSnapshot={assessments[0] || null}
                    assessmentHistory={assessments}
                    showLinkCta={showLinkCta}
                />
                : <section className="ph-state" role={state.kind === 'ready' ? 'status' : 'alert'}>
                    <h2 className="ph-state__title">
                        {state.kind === 'loading' ? 'Đang tải hồ sơ' : state.kind === 'empty' ? 'Không tìm thấy hồ sơ' : 'Chưa mở được hồ sơ'}
                    </h2>
                    <p className="ph-state__text">{state.message}</p>
                </section>}
        </div>
    );
}
