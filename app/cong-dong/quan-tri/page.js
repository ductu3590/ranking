import { getValidatedPlatformSessionFromCookies } from '@/lib/platformSession';
import AdminTournamentsClient from './AdminTournamentsClient';
import PlatformLoginClient from './PlatformLoginClient';

export const dynamic = 'force-dynamic';

// Cổng quản trị hệ thống PickHub (Epic 4; Stitch PLA-01 và PLA-03). Render theo phiên admin hệ thống phía server:
// chưa đăng nhập → form đăng nhập; đã đăng nhập → danh sách giải cộng đồng và form tạo/sửa giải.
export default async function CommunityAdminPage() {
  const session = await getValidatedPlatformSessionFromCookies();
  if (!session) return <PlatformLoginClient signedInRole={null} />;
  return <AdminTournamentsClient role={session.role} />;
}
