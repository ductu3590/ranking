import { requirePlayerSession } from '@/lib/playerSession';
import { callCommunityRpc, communityError, communityJson } from '@/lib/communityServer';

export const dynamic = 'force-dynamic';

// VĐV rút đơn của mình (chủ đơn hoặc người ngồi ghế 2). RPC kiểm quyền, khoá giải đã chốt và giải phóng suất.
export async function POST(_request, { params }) {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;
        const registrationId = Number(params?.id);
        if (!Number.isSafeInteger(registrationId) || registrationId <= 0) return communityError('COMMUNITY_NOT_FOUND', 404);
        const rpc = await callCommunityRpc('community_player_action', {
            p_registration_id: registrationId,
            p_account_id: auth.account.id,
            p_action: 'withdraw',
            p_payload: {},
        });
        if (!rpc.ok) return rpc.response;
        return communityJson({ registrationId, status: rpc.data.status });
    } catch (error) {
        console.error('community withdraw error:', error);
        return communityError('INTERNAL', 500);
    }
}
