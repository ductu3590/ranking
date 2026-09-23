'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import SetupStudio from './setup-v3/SetupStudio';

// Điểm vào luồng tạo giải nội bộ (đợt Stitch, spec Lát 0). Toàn bộ nghiệp vụ nằm
// trong setup-v3/; file này chỉ đọc tham số URL.
export default function TournamentWizard({ onDone }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tournamentId = searchParams.get('tournamentId') || searchParams.get('t');
    const divisionId = searchParams.get('divisionId') || searchParams.get('division') || searchParams.get('d');
    const step = Number(searchParams.get('step')) || null;

    return (
        <SetupStudio
            key={`${tournamentId || 'new'}:${divisionId || ''}`}
            tournamentId={tournamentId}
            divisionId={divisionId}
            step={step}
            onExit={() => {
                if (typeof onDone === 'function') onDone(null);
                else router.push('/giai-dau/v2');
            }}
        />
    );
}
