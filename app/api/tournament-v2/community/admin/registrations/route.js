import { requireCommunityAdmin, loadAdminRegistrations } from '@/lib/communityAdminServer';
import { communityError, communityJson } from '@/lib/communityServer';

export const dynamic = 'force-dynamic';

// Bảng duyệt đăng ký một nội dung (PLA-02). Admin hệ thống thấy SĐT VĐV; không route công khai nào trả các trường này.
export async function GET(request) {
    try {
        const admin = await requireCommunityAdmin();
        if (!admin.ok) return admin.response;
        const divisionId = Number(new URL(request.url).searchParams.get('divisionId'));
        if (!Number.isSafeInteger(divisionId) || divisionId <= 0) return communityError('COMMUNITY_NOT_FOUND', 404);
        const board = await loadAdminRegistrations(divisionId);
        if (!board) return communityError('COMMUNITY_NOT_FOUND', 404);
        return communityJson(board);
    } catch (error) {
        console.error('community admin registrations GET error:', error);
        return communityError('INTERNAL', 500);
    }
}
