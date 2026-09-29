import { requirePlayerSession } from '@/lib/playerSession';
import { communityError, communityJson, loadPartnerBoard } from '@/lib/communityServer';

export const dynamic = 'force-dynamic';

// "Bảng tìm bạn ghép" (D59): chỉ cho VĐV đã đăng nhập CÓ đơn lẻ đang tìm bạn trong nội dung đó. Chỉ tên hiển thị
// (+ giới tính khi nội dung Nam-Nữ, + PHR khi nội dung có cap); không SĐT, không lộ người ngoài nội dung.
export async function GET(request) {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;
        const divisionId = Number(new URL(request.url).searchParams.get('divisionId'));
        if (!Number.isSafeInteger(divisionId) || divisionId <= 0) return communityError('COMMUNITY_NOT_FOUND', 404);
        const candidates = await loadPartnerBoard(auth.account.id, divisionId);
        if (candidates === null) return communityError('COMMUNITY_NOT_FOUND', 404);
        return communityJson({ candidates });
    } catch (error) {
        console.error('community partner-board GET error:', error);
        return communityError('INTERNAL', 500);
    }
}
