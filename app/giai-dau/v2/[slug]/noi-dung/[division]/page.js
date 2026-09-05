// Trang công khai của một nội dung thi đấu (division).
// Server component để có generateMetadata riêng — link chia sẻ vào nhóm Zalo
// của từng nội dung sẽ hiện card đúng tên nội dung đó.
import { loadPublicShareData } from '@/lib/publicTournamentRead';
import { buildPublicMetadata } from '../../shareMetadata';
import DivisionPublicView from './DivisionPublicView';

export async function generateMetadata({ params }) {
    try {
        const divisionId = params?.division;
        const loaded = await loadPublicShareData(params?.slug, { withCompetition: false });
        if (!loaded) return buildPublicMetadata(null);
        const exists = (loaded.snapshot.divisions || [])
            .some((division) => String(division.id) === String(divisionId));
        return buildPublicMetadata(loaded, { divisionId: exists ? divisionId : undefined });
    } catch (error) {
        console.error('generateMetadata public division error:', error);
        return { title: 'Nội dung thi đấu — PickHub', robots: { index: false, follow: false } };
    }
}

export default function PublicDivisionPage({ params }) {
    return <DivisionPublicView slug={params?.slug} divisionId={params?.division} />;
}
