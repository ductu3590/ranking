import { requirePlayerSession } from '@/lib/playerSession';
import { callCommunityRpc, communityError, communityJson } from '@/lib/communityServer';

export const dynamic = 'force-dynamic';

const ACTIONS = ['accept', 'decline', 'cancel'];

// Người nhận nhận lời/từ chối lời mời; người gửi huỷ. RPC kiểm đúng người, cửa sổ đăng ký, ghép cặp nguyên tử.
export async function PATCH(request, { params }) {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;
        const inviteId = Number(params?.id);
        const body = await request.json().catch(() => ({}));
        if (!Number.isSafeInteger(inviteId) || inviteId <= 0 || !ACTIONS.includes(body?.action)) {
            return communityError('COMMUNITY_INVALID_TRANSITION', 400);
        }
        const rpc = await callCommunityRpc('community_invite_action', {
            p_invite_id: inviteId,
            p_account_id: auth.account.id,
            p_action: body.action,
        });
        if (!rpc.ok) return rpc.response;
        return communityJson({ inviteId, status: rpc.data.status, registrationId: rpc.data.registration_id ?? null });
    } catch (error) {
        console.error('community invites PATCH error:', error);
        return communityError('INTERNAL', 500);
    }
}
