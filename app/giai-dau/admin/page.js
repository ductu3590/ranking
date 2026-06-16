import { redirect } from 'next/navigation';

// Quản lý giải đấu đã chuyển sang v2 (clean-slate). Trang admin cũ redirect sang /giai-dau/v2.
export default function GiaiDauAdminRedirect() {
    redirect('/giai-dau/v2');
}
