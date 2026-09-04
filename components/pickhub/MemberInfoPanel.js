import './MemberInfoPanel.css';

function phrLabel(value) {
    if (!Number.isFinite(Number(value))) return 'Chưa đánh giá';
    if (value < 2) return 'Mới bắt đầu';
    if (value < 3) return 'Cơ bản';
    if (value < 4) return 'Trung bình';
    if (value < 4.6) return 'Khá';
    return 'Nâng cao';
}

function viDate(value) {
    if (!value) return 'Chưa ghi nhận';
    return new Intl.DateTimeFormat('vi-VN').format(new Date(value));
}

export default function MemberInfoPanel({ athleteMembership, phrSnapshot = null, assessmentHistory = [], privacyFlags = {} }) {
    if (!athleteMembership) return null;
    const athlete = athleteMembership.athlete || {};
    const score = phrSnapshot?.skillLevel;
    const initials = (athlete.displayName || athleteMembership.alias || 'VĐV').split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();

    return (
        <div className="member-info-panel">
            <article className="member-identity-card">
                <div className="member-identity-heading">
                    <span className="member-profile-avatar" aria-hidden="true">{initials}</span>
                    <div><span className="member-kicker">Hồ sơ trong CLB</span><h2>{athlete.displayName || athleteMembership.alias}</h2><p>Biệt danh: <strong>{athleteMembership.alias || 'Chưa đặt'}</strong></p></div>
                </div>
                <dl>
                    <div><dt>Mã VĐV</dt><dd>{athleteMembership.athleteId}</dd></div>
                    <div><dt>Membership</dt><dd>{athleteMembership.id}</dd></div>
                    <div><dt>Trạng thái</dt><dd><span className={`membership-chip is-${athleteMembership.status}`}>{athleteMembership.status === 'active' ? 'Đang sinh hoạt' : 'Đã kết thúc'}</span></dd></div>
                    <div><dt>Ngày tham gia</dt><dd>{viDate(athleteMembership.effectiveFrom)}</dd></div>
                </dl>
            </article>

            <div className="member-info-grid">
                <article className="member-phr-card">
                    <span className="member-kicker">PHR cá nhân</span>
                    <h2>Trình độ hiện tại</h2>
                    {phrSnapshot ? <><div className="member-phr-score"><strong>{Number(score).toFixed(1).replace('.', ',')}</strong><span>{phrLabel(score)}</span></div><div className="member-phr-meter" aria-label={`PHR ${score} trên 5`}><i style={{ width: `${Math.min(100, Math.max(0, Number(score) / 5 * 100))}%` }} /></div><p>Cập nhật {viDate(phrSnapshot.effectiveFrom || phrSnapshot.assessedAt)} · nguồn CLB.</p></> : <div className="member-info-empty"><strong>Chưa có PHR</strong><p>Trưởng nhóm chưa ghi nhận đánh giá trình độ cho membership này.</p></div>}
                </article>

                <article className="member-history-card">
                    <span className="member-kicker">Lịch sử cập nhật</span><h2>Các mốc trình độ</h2>
                    {assessmentHistory.length > 0 ? <ol>{assessmentHistory.map((item) => <li key={item.id}><i aria-hidden="true" /><div><strong>{phrLabel(item.skillLevel)} · {Number(item.skillLevel).toFixed(1).replace('.', ',')}</strong><span>{viDate(item.effectiveFrom || item.assessedAt)} · {item.source === 'correction' ? 'Hiệu chỉnh' : 'Trưởng nhóm'}</span></div></li>)}</ol> : <div className="member-info-empty"><strong>Chưa có lịch sử</strong><p>Các lần cập nhật PHR sẽ xuất hiện tại đây.</p></div>}
                </article>
            </div>

            <aside className="member-privacy-note">
                <strong>{privacyFlags.sharedSession ? 'Phiên truy cập CLB dùng chung' : 'Phạm vi dữ liệu CLB'}</strong>
                <p>Đây là dữ liệu athlete/membership được chọn trong CLB, không phải xác nhận danh tính cá nhân. Thông tin liên hệ và ghi chú riêng không được hiển thị.</p>
            </aside>
        </div>
    );
}

export { phrLabel };
