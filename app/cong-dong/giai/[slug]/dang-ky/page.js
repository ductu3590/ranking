import RegisterClient from './RegisterClient';

export const dynamic = 'force-dynamic';

// Đăng ký một nội dung giải cộng đồng (Epic 4 C2; Stitch PLC-04). Cần phiên VĐV: client chuyển tới đăng nhập nếu chưa có.
export default function RegisterPage({ params }) {
  return <RegisterClient slug={params.slug} />;
}
