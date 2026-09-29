import { getValidatedPlatformSessionFromCookies } from '@/lib/platformSession';
import PlatformLoginClient from './PlatformLoginClient';

export const dynamic = 'force-dynamic';

// Cổng quản trị hệ thống PickHub (Epic 4 C1; Stitch PLA-01). Render theo phiên admin hệ thống phía server:
// chưa đăng nhập → form đăng nhập; đã đăng nhập → lời chào + đăng xuất. Danh sách giải cộng đồng: lát C2.
export default async function CommunityAdminPage() {
  const session = await getValidatedPlatformSessionFromCookies();
  return <PlatformLoginClient signedInRole={session?.role || null} />;
}
