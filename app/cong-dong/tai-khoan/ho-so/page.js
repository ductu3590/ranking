import ProfileClient from './ProfileClient';

export const dynamic = 'force-dynamic';

// Hồ sơ VĐV công khai (Epic 4 C1). Cần phiên VĐV: client gọi /api/player/profile, 401 → về trang đăng nhập.
export default function PlayerProfilePage() {
  return <ProfileClient />;
}
