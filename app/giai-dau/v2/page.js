import { redirect } from 'next/navigation';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';
import { getAthleteClubContext } from '@/lib/clubReadContext';
import TournamentV2DashboardClient from './TournamentV2DashboardClient';

// Dashboard giải đấu là không gian vận hành nội bộ CLB. Không dùng default
// group context ở đây: khách chưa có phiên CLB hợp lệ không được render UI.
// VĐV đăng nhập bằng tài khoản cá nhân được vào xem — mọi nút vận hành trong
// dashboard đã gắn với role 'admin' nên vé VĐV chỉ thấy bản chỉ-đọc.
export default async function TournamentV2Page() {
    const clubSession = await getValidatedGroupSessionFromCookies();
    // Chỉ nhận hai nguồn: phiên CLB member/admin, hoặc vé VĐV đã đối chiếu DB. Cố ý
    // KHÔNG dùng getClubReadContext ở đây — hàm đó fallback về default group context
    // (role 'member', signed:false), khách vãng lai sẽ lọt vào dashboard.
    const allowed = (clubSession && ['admin', 'member'].includes(clubSession.role))
        || Boolean(await getAthleteClubContext());

    if (!allowed) {
        redirect('/truy-cap-bi-tu-choi');
    }

    return <TournamentV2DashboardClient />;
}
