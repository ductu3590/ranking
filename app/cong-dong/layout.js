import Link from 'next/link';
import './community.css';
import './community-c2.css';
import './community-stitch.css';
import TopbarAccount from './TopbarAccount';

export const metadata = {
  title: 'Giải cộng đồng · PickHub',
  description: 'Đăng ký giải pickleball cộng đồng, rủ bạn ghép cặp và theo dõi đơn của bạn.',
};

// Khung nhẹ cho khu Giải cộng đồng (Epic 4). Cố ý không dùng khung điều hướng của CLB: người chơi ở đây không thuộc
// CLB nào và không có phiên CLB.
export default function CommunityLayout({ children }) {
  return (
    <div className="cd-shell">
      <header className="cd-topbar">
        <Link className="cd-brand" href="/cong-dong" aria-label="PickHub — Giải cộng đồng">
          <span className="cd-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M8 8h.01M12 8h.01M16 8h.01M10 12h.01M14 12h.01M12 16h.01" />
            </svg>
          </span>
          <span className="cd-brand__name">PickHub</span>
          <span className="cd-brand__tag"><i aria-hidden="true" />Giải cộng đồng</span>
        </Link>
        <TopbarAccount />
      </header>
      <main className="cd-main">{children}</main>
    </div>
  );
}
