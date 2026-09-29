import MyRegistrationsClient from './MyRegistrationsClient';

export const dynamic = 'force-dynamic';

// "Đơn của tôi" (Epic 4 C2; Stitch PLC-06). Cần phiên VĐV: client chuyển tới đăng nhập nếu chưa có.
export default function MyRegistrationsPage() {
  return <MyRegistrationsClient />;
}
