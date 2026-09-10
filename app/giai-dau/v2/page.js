import { redirect } from 'next/navigation';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';
import TournamentV2DashboardClient from './TournamentV2DashboardClient';

// Dashboard giải đấu là không gian vận hành nội bộ CLB. Không dùng default
// group context ở đây: khách chưa có phiên CLB hợp lệ không được render UI.
export default async function TournamentV2Page() {
    const session = await getValidatedGroupSessionFromCookies();

    if (!session || !['admin', 'member'].includes(session.role)) {
        redirect('/truy-cap-bi-tu-choi');
    }

    return <TournamentV2DashboardClient />;
}
