import { redirect } from 'next/navigation';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';
import AdminRequired from '../AdminRequired';
import InvitationDetailClient from './InvitationDetailClient';

export const dynamic = 'force-dynamic';

const ID_RE = /^[1-9][0-9]{0,17}$/;

// Chi tiết lời mời + đăng ký cặp của CLB khách (spec Epic 3 F3 §4.4, FRD-06). Quyền thật do API kiểm
// (requireParticipantClubAccess lọc club_id theo phiên); trang chỉ chặn sớm phiên thiếu / không phải quản trị.
export default async function FriendlyInvitationPage({ params }) {
  const id = String(params?.id || '');
  const path = ID_RE.test(id) ? `/giai-dau/loi-moi/${id}` : '/giai-dau/loi-moi';
  const session = await getValidatedGroupSessionFromCookies();
  if (!session) redirect(`/?dang-nhap=clb&next=${encodeURIComponent(path)}`);
  if (!ID_RE.test(id)) redirect('/giai-dau/loi-moi');
  if (session.role !== 'admin') return <AdminRequired next={path} />;
  return <InvitationDetailClient id={id} />;
}
