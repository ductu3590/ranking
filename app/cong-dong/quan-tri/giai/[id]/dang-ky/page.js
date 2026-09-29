import { redirect } from 'next/navigation';

import { getValidatedPlatformSessionFromCookies } from '@/lib/platformSession';
import AdminRegistrationsClient from './AdminRegistrationsClient';

export const dynamic = 'force-dynamic';

// Bảng duyệt danh sách của một giải cộng đồng (Epic 4 C2; Stitch PLA-02). Chỉ admin hệ thống.
export default async function AdminRegistrationsPage({ params }) {
  const session = await getValidatedPlatformSessionFromCookies();
  if (!session) redirect('/cong-dong/quan-tri');
  return <AdminRegistrationsClient tournamentId={Number(params.id)} role={session.role} />;
}
