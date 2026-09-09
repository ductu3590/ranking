import { phrLabel } from './MemberInfoPanel';
import './MemberProfileView.css';

function viDate(value) {
    if (!value) return 'Chưa ghi nhận';
    return new Intl.DateTimeFormat('vi-VN').format(new Date(value));
}

export default function MemberProfileView({
    athleteMembership,
    phrSnapshot = null,
    assessmentHistory = [],
    showLinkCta = false,
}) {
    if (!athleteMembership) return null;
    const athlete = athleteMembership.athlete || {};
    const displayName = athlete.displayName || athleteMembership.alias || 'VĐV';
    const score = Number(phrSnapshot?.skillLevel);
    const hasScore = Number.isFinite(score);
    const percent = hasScore ? Math.min(100, Math.max(0, (score / 5) * 100)) : 0;
    const initials = displayName.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();

    return (
        <div className="member-profile">
            {showLinkCta && (
                <section className="member-cta">
                    <span className="member-cta__ico" aria-hidden="true">🔗</span>
                    <div className="member-cta__body">
                        <span className="member-cta__kicker">Xác thực chính chủ</span>
                        <h3>Bạn chính là {displayName}?</h3>
                        <p>Liên kết tài khoản để tự quản lý chỉ số PHR, xem lịch sử đóng góp quỹ của riêng mình và nhận thông báo trực tiếp.</p>
                    </div>
                    <div className="member-cta__act">
                        <button type="button" className="ph-btn" disabled>Tạo tài khoản &amp; liên kết VĐV này</button>
                        <small>Chưa hoạt động — sẽ mở ở bước sau</small>
                    </div>
                </section>
            )}

            <article className="member-identity-card">
                <span className="member-profile-avatar" aria-hidden="true">{initials}</span>
                <div>
                    <span className="member-kicker">Hồ sơ trong CLB</span>
                    <h2>{displayName}</h2>
                    <p>Biệt danh: <strong>{athleteMembership.alias || 'Chưa đặt'}</strong></p>
                </div>
                <dl className="member-identity-facts">
                    <div><dt>Mã VĐV</dt><dd>{athleteMembership.athleteId}</dd></div>
                    <div><dt>Membership</dt><dd>{athleteMembership.id}</dd></div>
                    <div><dt>Trạng thái</dt><dd>{athleteMembership.status === 'active' ? 'Đang sinh hoạt' : 'Đã kết thúc'}</dd></div>
                    <div><dt>Ngày tham gia</dt><dd>{viDate(athleteMembership.effectiveFrom)}</dd></div>
                </dl>
            </article>

            <div className="member-profile-grid">
                <article className="member-phr-card">
                    <span className="member-kicker">PHR cá nhân</span>
                    <h2>Trình độ hiện tại</h2>
                    {hasScore ? (
                        <>
                            <div className="member-phr-score">
                                <strong>{score.toFixed(1).replace('.', ',')}</strong>
                                <span className="ph-badge ph-badge--muted">{phrLabel(score)}</span>
                            </div>
                            <div className="member-phr-meter" aria-label={`PHR ${score} trên 5`}>
                                <i style={{ width: `${percent}%` }} />
                                <b style={{ left: `${percent}%` }} />
                            </div>
                            <div className="member-phr-scale"><span>1,0 Tân thủ</span><span>2,5</span><span>3,5 Khá</span><span>5,0</span></div>
                            <p>Cập nhật {viDate(phrSnapshot.effectiveFrom || phrSnapshot.assessedAt)} · nguồn CLB.</p>
                        </>
                    ) : (
                        <div className="member-info-empty"><strong>Chưa có PHR</strong><p>Trưởng nhóm chưa ghi nhận đánh giá trình độ cho membership này.</p></div>
                    )}
                </article>

                <article className="member-history-card">
                    <span className="member-kicker">Lịch sử cập nhật</span>
                    <h2>Các mốc trình độ</h2>
                    {assessmentHistory.length > 0 ? (
                        <ol className="member-timeline">
                            {assessmentHistory.map((item, index) => (
                                <li key={item.id}>
                                    <strong>
                                        {phrLabel(item.skillLevel)} · {Number(item.skillLevel).toFixed(1).replace('.', ',')}
                                        {index === 0 && <span className="ph-badge ph-badge--gold">Mới nhất</span>}
                                    </strong>
                                    <span>{viDate(item.effectiveFrom || item.assessedAt)} · {item.source === 'correction' ? 'Hiệu chỉnh' : 'Trưởng nhóm'}</span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <div className="member-info-empty"><strong>Chưa có lịch sử</strong><p>Các lần cập nhật PHR sẽ xuất hiện tại đây.</p></div>
                    )}
                </article>
            </div>

            <aside className="member-privacy-note">
                <strong>Phiên truy cập CLB dùng chung</strong>
                <p>Đây là dữ liệu athlete/membership được chọn trong CLB, không phải xác nhận danh tính cá nhân. Thông tin liên hệ và ghi chú riêng không được hiển thị.</p>
            </aside>
        </div>
    );
}
