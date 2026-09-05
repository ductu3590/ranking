// Ảnh Open Graph mặc định của trang giải công khai (Next file convention).
// Dán link vào Zalo/Facebook sẽ ra card có ảnh thay vì link trần.
// Ảnh dựng từ tên giải, ngày, địa điểm và logo (logo_url) của CLB chủ giải khi
// BTC chưa tải poster; có poster thì generateMetadata đã trỏ thẳng vào poster.
import { loadPublicShareData } from '@/lib/publicTournamentRead';
import { buildShareImageModel } from '@/lib/tournament/share';
import { renderCardPng } from '@/app/api/tournament-v2/public/share-image/cardImage';

export const runtime = 'nodejs';
export const alt = 'Giải đấu PickHub';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage({ params }) {
    const loaded = await loadPublicShareData(params?.slug, { withCompetition: false });
    if (!loaded) {
        return new Response('Not found', { status: 404 });
    }
    const host = loaded.host ? { name: loaded.host.name, logo_url: loaded.host.logo_url } : null;
    const model = buildShareImageModel(loaded.snapshot, 'card', { host });
    const png = await renderCardPng(model, host);
    if (png) return png;

    // Không nạp được font tiếng Việt (thường do máy chủ không ra được Internet):
    // trả SVG để card vẫn có ảnh và chữ tiếng Việt vẫn đúng dấu.
    const { renderShareImage } = await import('@/lib/tournament/share');
    const image = renderShareImage(loaded.snapshot, 'card', { host });
    return new Response(image.svg, {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
    });
}
