import Link from 'next/link';
import './access-denied.css';

export const metadata = {
    title: 'Cần quyền truy cập CLB — PickHub',
    robots: { index: false, follow: false },
};

export default function AccessDeniedPage() {
    return (
        <main className="access-denied-page">
            <section className="access-denied-card" aria-labelledby="access-denied-title">
                <span className="access-denied-mark" aria-hidden="true">🔒</span>
                <p className="access-denied-kicker">KHU VỰC NỘI BỘ CLB</p>
                <h1 id="access-denied-title">Bạn chưa có quyền vào quản lý giải đấu</h1>
                <p>
                    Trang này dành cho thành viên và quản trị viên của câu lạc bộ.
                    Bạn chỉ có thể xem trang chi tiết của giải cộng đồng qua liên kết được chia sẻ.
                </p>
                <div className="access-denied-actions">
                    <Link className="access-denied-primary" href="/">Về trang chủ</Link>
                    <span>Đã có mã CLB? Hãy đăng nhập lại để tiếp tục.</span>
                </div>
            </section>
        </main>
    );
}
