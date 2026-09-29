import { consumePublicRateLimit } from '@/lib/publicRateLimit';
import { requirePlayerSession } from '@/lib/playerSession';
import { callCommunityRpc, communityError, communityJson, communityRateLimited } from '@/lib/communityServer';
import { issuePartnerToken, partnerLinkPath } from '@/lib/tournament/communityPartnerLink';

export const dynamic = 'force-dynamic';

// Tạo (hoặc đổi) link rủ ghép cặp cho đơn lẻ của mình. Token thô chỉ trả ra đúng một lần; DB chỉ giữ băm + hạn.
// Tạo link mới ghi đè băm cũ → link cũ mất hiệu lực.
export async function POST(request) {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;
        const rate = await consumePublicRateLimit('community_join', { accountId: auth.account.id });
        if (!rate.allowed) return communityRateLimited(rate);

        const body = await request.json().catch(() => ({}));
        const registrationId = Number(body?.registrationId);
        if (!Number.isSafeInteger(registrationId) || registrationId <= 0) return communityError('COMMUNITY_NOT_FOUND', 404);

        const { rawToken, tokenHash, expiresAt } = issuePartnerToken();
        const rpc = await callCommunityRpc('community_player_action', {
            p_registration_id: registrationId,
            p_account_id: auth.account.id,
            p_action: 'set_link',
            p_payload: { token_hash: tokenHash, expires_at: expiresAt },
        });
        if (!rpc.ok) return rpc.response;
        return communityJson({ path: partnerLinkPath(rawToken), expiresAt });
    } catch (error) {
        console.error('community partner-link POST error:', error);
        return communityError('INTERNAL', 500);
    }
}
