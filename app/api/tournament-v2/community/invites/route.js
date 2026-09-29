import { consumePublicRateLimit } from '@/lib/publicRateLimit';
import { requirePlayerSession } from '@/lib/playerSession';
import { callCommunityRpc, communityError, communityJson, communityRateLimited } from '@/lib/communityServer';
import { normalizePhone } from '@/lib/tournament/openRegistration';

export const dynamic = 'force-dynamic';

// Mời ghép cặp: theo SĐT chính xác ({registrationId, partnerPhone}) hoặc theo mã đơn từ "Bảng tìm bạn ghép"
// ({registrationId, targetRegistrationId}). Phản hồi ĐỒNG NHẤT dù SĐT có tài khoản hay không (chống dò danh sách SĐT);
// giới hạn 3 lần/giờ/tài khoản (D59, D60).
export async function POST(request) {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;
        const rate = await consumePublicRateLimit('community_invite', { accountId: auth.account.id });
        if (!rate.allowed) return communityRateLimited(rate);

        const body = await request.json().catch(() => ({}));
        const registrationId = Number(body?.registrationId);
        if (!Number.isSafeInteger(registrationId) || registrationId <= 0) return communityError('COMMUNITY_NOT_FOUND', 404);

        let action;
        let payload;
        if (body?.targetRegistrationId != null) {
            const target = Number(body.targetRegistrationId);
            if (!Number.isSafeInteger(target) || target <= 0) return communityError('COMMUNITY_NOT_FOUND', 404);
            action = 'invite_registration';
            payload = { target_registration_id: target };
        } else {
            let phone;
            try {
                phone = normalizePhone(body?.partnerPhone);
            } catch {
                return communityError('COMMUNITY_PARTNER_PHONE_INVALID', 400);
            }
            action = 'invite';
            payload = { partner_phone: phone };
        }
        const rpc = await callCommunityRpc('community_player_action', {
            p_registration_id: registrationId,
            p_account_id: auth.account.id,
            p_action: action,
            p_payload: payload,
        });
        if (!rpc.ok) return rpc.response;
        return communityJson({ ok: true }, 201);
    } catch (error) {
        console.error('community invites POST error:', error);
        return communityError('INTERNAL', 500);
    }
}
