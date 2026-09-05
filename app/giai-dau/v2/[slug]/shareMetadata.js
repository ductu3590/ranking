// Helper dùng chung cho generateMetadata của trang giải và trang từng nội dung.
// Không phải file route/page nên được phép export tự do.
import { buildOpenGraph } from '@/lib/tournament/share';

export function resolvePublicBaseUrl() {
    const raw = process.env.NEXT_PUBLIC_SITE_URL
        || process.env.NEXT_PUBLIC_BASE_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    return String(raw || '').replace(/\/+$/, '');
}

function metadataFromOpenGraph(og, { withImage }) {
    const baseUrl = resolvePublicBaseUrl();
    const images = withImage
        ? [{ url: og.image.url, width: og.image.width, height: og.image.height, alt: og.image.alt }]
        : undefined;
    return {
        ...(baseUrl ? { metadataBase: new URL(baseUrl) } : {}),
        title: og.title,
        description: og.description,
        alternates: { canonical: og.url },
        openGraph: {
            type: og.type,
            title: og.title,
            description: og.description,
            url: og.url,
            siteName: og.siteName,
            locale: og.locale,
            ...(images ? { images } : {}),
        },
        twitter: {
            card: 'summary_large_image',
            title: og.title,
            description: og.description,
            ...(images ? { images: images.map((image) => image.url) } : {}),
        },
        robots: { index: og.robots.index, follow: og.robots.follow },
    };
}

/**
 * @param {object|null} loaded kết quả loadPublicShareData
 * @param {object} options { divisionId }
 */
export function buildPublicMetadata(loaded, options = {}) {
    if (!loaded) {
        return { title: 'Giải đấu không tồn tại — PickHub', robots: { index: false, follow: false } };
    }
    const og = buildOpenGraph(loaded.snapshot, {
        baseUrl: resolvePublicBaseUrl(),
        divisionId: options.divisionId,
    });
    // Ảnh 'generated' ở cấp giải để opengraph-image.js (file convention) tự gắn
    // URL có hash; poster BTC tải lên hoặc ảnh theo nội dung thì trỏ URL tường minh.
    const withImage = og.image.source !== 'generated' || options.divisionId != null;
    return metadataFromOpenGraph(og, { withImage });
}
