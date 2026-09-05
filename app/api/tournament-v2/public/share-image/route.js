// GET /api/tournament-v2/public/share-image
// Ảnh chia sẻ dựng từ public projection: card Open Graph, kết quả bốc thăm,
// lịch theo sân/theo CLB, bảng xếp hạng, kết quả và bảng vàng.
// Đây là endpoint đọc công khai: không cookie, không group context; giải chưa
// công khai (`private`) trả 404 giống như trang công khai.
import { NextResponse } from 'next/server';
import { loadPublicShareData } from '@/lib/publicTournamentRead';
import { renderShareImage, SHARE_IMAGE_KINDS } from '@/lib/tournament/share';
import { renderCardPng } from './cardImage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'public, max-age=120, s-maxage=300, stale-while-revalidate=600';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const slugParam = searchParams.get('slug');
        if (!slugParam) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

        const kind = searchParams.get('kind') || 'card';
        if (!SHARE_IMAGE_KINDS.includes(kind)) {
            return NextResponse.json({ error: `kind không hợp lệ: ${kind}` }, { status: 400 });
        }
        const format = searchParams.get('format') === 'png' ? 'png' : 'svg';
        const divisionId = searchParams.get('division');
        const stageId = searchParams.get('stage');

        const loaded = await loadPublicShareData(slugParam, { withCompetition: kind !== 'card' });
        if (!loaded) return NextResponse.json({ error: 'Giải đấu không tồn tại' }, { status: 404 });

        // public_slug là danh tính toàn hệ thống; dùng chính giá trị đã lưu để
        // đặt tên file tải về thay vì tham số người dùng gửi lên.
        const slug = loaded.snapshot.tournament.public_slug;
        const image = renderShareImage(loaded.snapshot, kind, {
            divisionId: divisionId != null && divisionId !== '' ? divisionId : undefined,
            stageId: stageId != null && stageId !== '' ? stageId : undefined,
            host: loaded.host,
        });

        if (format === 'png' && kind === 'card') {
            const png = await renderCardPng(image.model, loaded.host);
            if (png) return png;
            // Không nạp được font tiếng Việt: trả SVG thay vì PNG có glyph lỗi.
        }

        return new Response(image.svg, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml; charset=utf-8',
                'Content-Disposition': `inline; filename="${slug || 'giai-dau'}-${kind}.svg"`,
                'Cache-Control': CACHE_CONTROL,
            },
        });
    } catch (err) {
        if (err && err.code === 'SHARE_NOT_PUBLIC') {
            return NextResponse.json({ error: 'Giải chưa công khai' }, { status: 404 });
        }
        if (err && (err.code === 'SHARE_UNKNOWN_KIND' || err.code === 'SHARE_DIVISION_NOT_FOUND')) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        console.error('Public share-image GET error:', err);
        return NextResponse.json({ error: err.message }, { status: err.status || 500 });
    }
}
