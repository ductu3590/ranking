import JoinLinkClient from './JoinLinkClient';

export const dynamic = 'force-dynamic';

// Vào cặp bằng link rủ (Epic 4 C2, D59). Cần phiên VĐV: chưa đăng nhập → chuyển tới đăng nhập rồi quay lại đúng link.
export default function JoinLinkPage({ params }) {
  return <JoinLinkClient token={params.token} />;
}
