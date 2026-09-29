import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { projectPlayerAccount } from '@/lib/domain/identity/playerAccount';
import { consumePublicRateLimit } from '@/lib/publicRateLimit';
import { requirePlayerSession } from '@/lib/playerSession';
import { callCommunityRpc, communityError, communityJson, communityRateLimited } from '@/lib/communityServer';
import { messageFor } from '@/lib/tournament/communityMessages';
import { validateCommunitySubmission } from '@/lib/tournament/communityRegistration';

export const dynamic = 'force-dynamic';

const VALIDATION_STATUS = { PLAYER_SESSION_REQUIRED: 401, PLAYER_NAME_INVALID: 400 };

// Đăng ký một nội dung giải cộng đồng (Epic 4 C2, D58: bắt buộc phiên VĐV). Domain kiểm nhanh để báo lỗi rõ;
// RPC community_register kiểm lại tất cả (nguồn sự thật) và dựng ghế 1 từ hồ sơ tài khoản trong DB.
export async function POST(request) {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;
        const accountId = auth.account.id;

        const rate = await consumePublicRateLimit('community_register', { accountId });
        if (!rate.allowed) return communityRateLimited(rate);

        const body = await request.json().catch(() => ({}));
        if (typeof body?.company === 'string' && body.company.trim() !== '') return communityError('PLAYER_HONEYPOT', 400);
        const divisionId = Number(body?.divisionId);
        if (!Number.isSafeInteger(divisionId) || divisionId <= 0) return communityError('COMMUNITY_NOT_FOUND', 404);

        const { data: division, error } = await supabaseAdmin.from('tournament_divisions')
            .select('id, entrant_type, gender_mode, rating_cap, age_min, age_max').eq('id', divisionId).maybeSingle();
        if (error) throw error;
        if (!division) return communityError('COMMUNITY_NOT_FOUND', 404);

        const checked = validateCommunitySubmission({
            division,
            account: projectPlayerAccount(auth.account),
            partnerMode: body?.partnerMode,
            partnerPhone: body?.partnerPhone,
        });
        if (!checked.ok) {
            return communityJson({ error: messageFor(checked.code), code: checked.code }, VALIDATION_STATUS[checked.code] || 400);
        }

        const rpc = await callCommunityRpc('community_register', {
            p_division_id: divisionId,
            p_account_id: accountId,
            p_partner_phone: checked.value.partnerPhoneNorm,
        });
        if (!rpc.ok) return rpc.response;
        return communityJson({ registrationId: rpc.data.registration_id, status: rpc.data.status }, 201);
    } catch (error) {
        console.error('community registrations POST error:', error);
        return communityError('INTERNAL', 500);
    }
}
