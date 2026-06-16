import { redirect } from 'next/navigation';

// Module giải đấu đã chuyển sang v2 (clean-slate). Trang cũ redirect sang /giai-dau/v2.
export default function GiaiDauRedirect() {
    redirect('/giai-dau/v2');
}
