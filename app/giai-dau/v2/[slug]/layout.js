// Server layout của trang giải công khai: chỉ để gắn metadata Open Graph.
// page.js vẫn là client component (polling snapshot), mà client component
// không export được generateMetadata, nên metadata đặt ở layout cùng segment.
import { loadPublicShareData } from '@/lib/publicTournamentRead';
import { buildPublicMetadata } from './shareMetadata';

export async function generateMetadata({ params }) {
    try {
        // buildPublicMetadata gọi buildOpenGraph; giải private không load được
        // nên card chia sẻ cũng không tồn tại.
        const loaded = await loadPublicShareData(params?.slug, { withCompetition: false });
        return buildPublicMetadata(loaded);
    } catch (error) {
        console.error('generateMetadata public tournament error:', error);
        return { title: 'Giải đấu — PickHub', robots: { index: false, follow: false } };
    }
}

export default function PublicTournamentLayout({ children }) {
    return children;
}
