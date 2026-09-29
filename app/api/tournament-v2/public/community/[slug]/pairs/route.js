import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { communityError, communityJson, loadPublicCommunityTournament } from '@/lib/communityServer';
import { normalizePublicSlug } from '@/lib/tournament/publicSnapshot';

export const dynamic = 'force-dynamic';

// Trang giải công khai (PLC-07, D57): tên giải + từng nội dung với bộ đếm X/Y và DANH SÁCH TÊN CẶP ĐÃ DUYỆT.
// Không SĐT, không ngày sinh, không đơn chờ duyệt / danh sách chờ / người đang tìm bạn. Payload đi qua
// assertNoForbiddenKeys trong loadPublicCommunityTournament.
export async function GET(_request, { params }) {
    try {
        if (!supabaseAdmin) return communityError('UNAVAILABLE', 503);
        const slug = normalizePublicSlug(params?.slug);
        if (!slug) return communityError('COMMUNITY_NOT_FOUND', 404);
        const payload = await loadPublicCommunityTournament(slug);
        if (!payload) return communityError('COMMUNITY_NOT_FOUND', 404);
        return communityJson(payload);
    } catch (error) {
        console.error('public community pairs GET error:', error);
        return communityError('INTERNAL', 500);
    }
}
