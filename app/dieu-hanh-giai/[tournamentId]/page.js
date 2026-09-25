import { redirect } from 'next/navigation';
import TournamentConsoleV2 from '@/app/giai-dau/v2/console/TournamentConsoleV2';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import './operations-fullscreen.css';

export default async function TournamentOperationsPage({ params }) {
    const access = await requireTournamentAccess({ tournamentId: params.tournamentId, need: 'write' });
    if (!access.ok) redirect('/giai-dau/v2');

    return (
        <div className="ops-full-page">
            <TournamentConsoleV2 tournamentId={params.tournamentId} />
        </div>
    );
}
