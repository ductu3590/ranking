import Link from 'next/link';
import './loi-moi.css';

// Phiên CLB là thành viên (không phải quản trị): lời mời chỉ quản trị CLB trả lời được (F1 §2.2, FRD-05 (3)).
export default function AdminRequired({ next }) {
  const href = next ? `/?dang-nhap=clb&next=${encodeURIComponent(next)}` : '/?dang-nhap=clb';
  return (
    <main className="li-page" aria-label="Cần quyền quản trị">
      <section className="li-card li-card--center">
        <span className="li-icon" data-tone="brand" aria-hidden="true">🛡</span>
        <h2>Cần tài khoản quản trị CLB để trả lời lời mời</h2>
        <p className="li-muted">Bạn đang đăng nhập bằng tài khoản thành viên.</p>
        <Link className="li-btn li-btn--primary li-btn--block" href={href}>Đăng nhập bằng quyền quản trị</Link>
      </section>
    </main>
  );
}
