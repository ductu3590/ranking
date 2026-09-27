import { redirect } from 'next/navigation';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';
import AdminRequired from './AdminRequired';
import InvitationsClient from './InvitationsClient';

export const dynamic = 'force-dynamic';

// Hộp lời mời giải giao hữu của CLB khách (spec Epic 3 F3 §4.3, FRD-04). Chỉ phiên CLB đã xác thực; vé VĐV
// hay khách vãng lai → đăng nhập CLB rồi quay lại. Thành viên thường → báo cần quyền quản trị.
export default async function FriendlyInvitationsPage() {
  const session = await getValidatedGroupSessionFromCookies();
  if (!session) redirect(`/?dang-nhap=clb&next=${encodeURIComponent('/giai-dau/loi-moi')}`);
  if (session.role !== 'admin') return <AdminRequired next="/giai-dau/loi-moi" />;
  return <InvitationsClient />;
}
