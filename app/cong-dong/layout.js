import Link from 'next/link';
import './community.css';

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
          <span className="cd-logo" aria-hidden="true">P</span>
          <span className="cd-brand__name">PickHub</span>
          <span className="cd-brand__tag">Giải cộng đồng</span>
        </Link>
        <nav className="cd-topnav" aria-label="Tài khoản">
          <Link className="cd-link" href="/cong-dong/tai-khoan/ho-so">Tài khoản</Link>
        </nav>
      </header>
      <main className="cd-main">{children}</main>
    </div>
  );
}
