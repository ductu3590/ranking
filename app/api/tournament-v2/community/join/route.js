import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { consumePublicRateLimit } from '@/lib/publicRateLimit';
import { requirePlayerSession } from '@/lib/playerSession';
import { callCommunityRpc, communityError, communityJson, communityRateLimited } from '@/lib/communityServer';
import { hashPartnerToken, isPartnerLinkExpired, isPartnerTokenShape } from '@/lib/tournament/communityPartnerLink';

export const dynamic = 'force-dynamic';

// GET ?token=: xem trước link rủ (chỉ VĐV đã đăng nhập): tên giải, nội dung, tên người rủ. Không SĐT.
export async function GET(request) {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;
        const token = new URL(request.url).searchParams.get('token');
        if (!isPartnerTokenShape(token)) return communityError('COMMUNITY_LINK_INVALID', 404);

        const { data: reg, error } = await supabaseAdmin.from('tournament_registrations')
            .select('id, division_id, status, partner_link_expires_at, player_account_id')
            .eq('partner_link_hash', hashPartnerToken(token)).maybeSingle();
        if (error) throw error;
        if (!reg || reg.status !== 'awaiting_partner' || isPartnerLinkExpired(reg.partner_link_expires_at)) {
            return communityError('COMMUNITY_LINK_INVALID', 404);
        }
        const [{ data: division }, { data: seat }] = await Promise.all([
            supabaseAdmin.from('tournament_divisions').select('id, tournament_id, name, entry_fee').eq('id', reg.division_id).maybeSingle(),
            supabaseAdmin.from('tournament_registration_members').select('full_name').eq('registration_id', reg.id).eq('seat', 1).maybeSingle(),
        ]);
        const { data: tournament } = division
            ? await supabaseAdmin.from('tournaments').select('name, event_date, location').eq('id', division.tournament_id).maybeSingle()
            : { data: null };
        return communityJson({
            inviterName: seat?.full_name || 'VĐV',
            isSelf: reg.player_account_id === auth.account.id,
            divisionName: division?.name || '',
            entryFee: division?.entry_fee ?? null,
            tournament: { name: tournament?.name || '', eventDate: tournament?.event_date || null, location: tournament?.location || null },
            expiresAt: reg.partner_link_expires_at,
        });
    } catch (error) {
        console.error('community join GET error:', error);
        return communityError('INTERNAL', 500);
    }
}

// POST {token}: vào cặp qua link. RPC nguyên tử: dùng đơn lẻ sẵn có hoặc tạo đơn mới từ hồ sơ rồi ghép.
export async function POST(request) {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;
        const rate = await consumePublicRateLimit('community_join', { accountId: auth.account.id });
        if (!rate.allowed) return communityRateLimited(rate);

        const body = await request.json().catch(() => ({}));
        if (!isPartnerTokenShape(body?.token)) return communityError('COMMUNITY_LINK_INVALID', 404);
        const rpc = await callCommunityRpc('community_join_by_link', {
            p_token_hash: hashPartnerToken(body.token),
            p_account_id: auth.account.id,
        });
        if (!rpc.ok) return rpc.response;
        return communityJson({ registrationId: rpc.data.registration_id, status: rpc.data.status }, 201);
    } catch (error) {
        console.error('community join POST error:', error);
        return communityError('INTERNAL', 500);
    }
}
