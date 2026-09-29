import { requireCommunityAdmin } from '@/lib/communityAdminServer';
import { callCommunityRpc, communityError, communityJson } from '@/lib/communityServer';

export const dynamic = 'force-dynamic';

const ACTIONS = ['admit', 'reject', 'remove', 'restore', 'withdraw', 'fee_confirm', 'fee_unconfirm', 'merge'];

// Hành động của admin trên một đơn (duyệt/từ chối/khôi phục/rút/ghép hộ/đánh dấu thu phí). Mọi thay đổi đi qua RPC
// nguyên tử community_admin_action (khoá theo nội dung, kiểm hạn mức, phiên bản `version`, giải đã chốt).
export async function POST(request, { params }) {
    try {
        const admin = await requireCommunityAdmin();
        if (!admin.ok) return admin.response;
        const registrationId = Number(params?.id);
        const body = await request.json().catch(() => ({}));
        if (!Number.isSafeInteger(registrationId) || registrationId <= 0 || !ACTIONS.includes(body?.action)) {
            return communityError('COMMUNITY_INVALID_TRANSITION', 400);
        }
        const version = body.version == null ? null : Number(body.version);
        const partner = body.partnerRegistrationId == null ? null : Number(body.partnerRegistrationId);
        if ((version != null && !Number.isSafeInteger(version)) || (partner != null && !Number.isSafeInteger(partner))) {
            return communityError('COMMUNITY_CONFLICT', 400);
        }
        const rpc = await callCommunityRpc('community_admin_action', {
            p_registration_id: registrationId,
            p_platform_account_id: admin.accountId,
            p_action: body.action,
            p_reason: typeof body.reason === 'string' ? body.reason.slice(0, 300) : null,
            p_version: version,
            p_partner_registration_id: partner,
        });
        if (!rpc.ok) return rpc.response;
        return communityJson({
            registrationId: rpc.data.registration_id,
            status: rpc.data.status,
            version: rpc.data.version,
            feeConfirmed: rpc.data.fee_confirmed ?? null,
        });
    } catch (error) {
        console.error('community admin registrations POST error:', error);
        return communityError('INTERNAL', 500);
    }
}
