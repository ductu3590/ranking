'use client';

import { useRouter } from 'next/navigation';

import SetupStudio from '@/app/giai-dau/v2/setup-v3/SetupStudio';

// Workspace 4 bước của giải cộng đồng: cùng studio với giải CLB, chế độ 'community' (Bước 2 = cặp đã duyệt, không chọn thành viên).
export default function CommunitySetupClient({ tournamentId, divisionId, step }) {
  const router = useRouter();
  return (
    <SetupStudio
      organizerMode="community"
      tournamentId={String(tournamentId)}
      divisionId={String(divisionId)}
      step={step}
      registrationsHref={`/cong-dong/quan-tri/giai/${tournamentId}/dang-ky`}
      onExit={() => router.push('/cong-dong/quan-tri')}
    />
  );
}
