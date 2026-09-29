import { redirect } from 'next/navigation';

import { getValidatedPlatformSessionFromCookies } from '@/lib/platformSession';
import { loadCommunitySetupTarget } from '@/lib/communityAdminServer';
import CommunitySetupClient from './CommunitySetupClient';
import DivisionChooser from './DivisionChooser';

export const dynamic = 'force-dynamic';

// Dựng giải cộng đồng bằng workspace setup 4 bước dùng chung (Epic 4 C3; Stitch PLA-04). Chỉ admin hệ thống và chỉ giải cộng đồng.
// Mỗi nội dung dựng riêng: có `divisionId` thì mở thẳng, chỉ có một nội dung thì tự chọn, nhiều nội dung thì cho chọn.
export default async function CommunitySetupPage({ params, searchParams }) {
  const session = await getValidatedPlatformSessionFromCookies();
  if (!session) redirect('/cong-dong/quan-tri');
  const tournamentId = Number(params.id);
  const target = await loadCommunitySetupTarget(tournamentId);
  if (!target) redirect('/cong-dong/quan-tri');
  const { tournament, divisions: list } = target;
  if (!list.length) redirect(`/cong-dong/quan-tri/giai/${tournamentId}/dang-ky`);

  const requested = Number(searchParams?.divisionId);
  const chosen = list.find((division) => division.id === requested) || (list.length === 1 ? list[0] : null);
  if (!chosen) return <DivisionChooser role={session.role} tournament={tournament} divisions={list} />;
  const step = Number(searchParams?.step);
  return (
    <CommunitySetupClient
      tournamentId={tournamentId}
      divisionId={chosen.id}
      step={Number.isInteger(step) ? step : undefined}
    />
  );
}
