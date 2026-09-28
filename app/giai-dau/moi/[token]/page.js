import { redirect } from 'next/navigation';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';
import { inviteLoginPath } from '@/lib/tournament/friendlyInviteLink';
import InviteLinkClient from './InviteLinkClient';

export const dynamic = 'force-dynamic';

// Trang mở link mời (spec Epic 3 F3 §4.2, FRD-05; D47). Chưa có phiên CLB → đăng nhập CLB rồi quay lại đúng link
// (`/?dang-nhap=clb&next=` + encodeURIComponent(path)). Có phiên → client gọi resolveInviteLink và hiện trạng thái.
// Trang này không đọc giải hay CLB chủ nhà: mọi thông tin chỉ tới sau khi server đối chiếu đúng CLB được mời.
export default async function InviteLinkPage({ params }) {
  const token = String(params?.token || '');
  const session = await getValidatedGroupSessionFromCookies();
  if (!session) redirect(inviteLoginPath(token));
  return <InviteLinkClient token={token} />;
}
