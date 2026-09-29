import TournamentListClient from './TournamentListClient';

export const dynamic = 'force-dynamic';

// Danh sách giải cộng đồng đang mở đăng ký (Epic 4 C2; Stitch PLC-01). Công khai, không cần đăng nhập.
export default function CommunityHomePage() {
  return <TournamentListClient />;
}
