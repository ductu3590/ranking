// Giải link mời CLB khách (spec Epic 3 F1 §6.3, README §5.3, D47). Trang /giai-dau/moi/[token] gọi:
//   POST { token } →
//     200 { invitationId }
//     401 { error, code: 'UNAUTHENTICATED', loginUrl }
//     404 { error, code: 'FRIENDLY_INVITE_LINK_INVALID' }
//     403 { error, code: 'FRIENDLY_INVITE_WRONG_CLUB', currentClubName }   — chỉ tên CLB của CHÍNH phiên
//     403 { error, code: 'GROUP_ADMIN_REQUIRED' }
//     410 { error, code: 'FRIENDLY_INVITE_LINK_EXPIRED', invitationId }
//     429 { error, code: 'RATE_LIMITED' }
// Token nằm trong body (không vào log truy cập qua query). Token chỉ là "địa chỉ": quyền do so CLB của phiên với
// club_id được mời; mọi đọc/ghi sau đó đi requireParticipantClubAccess.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';
import { consumeRateLimit, getClientIdentifier } from '@/lib/rateLimit';
import { decideInviteLink, hashInviteToken, inviteLoginPath, isInviteTokenShape } from '@/lib/tournament/friendlyInviteLink';
import { FRIENDLY_DIVISION_TEMPLATE, friendlyErrorPayload } from '@/lib/tournament/friendlyServer';

const db = supabaseAdmin || supabaseServer;
const NO_STORE = { 'Cache-Control': 'no-store' };

function respond(decision, token) {
    if (decision.status === 200) return NextResponse.json({ invitationId: decision.invitationId }, { headers: NO_STORE });
    const { body } = friendlyErrorPayload(decision.code, undefined, decision.status);
    if (decision.status === 401) body.loginUrl = inviteLoginPath(token);
    if (decision.code === 'FRIENDLY_INVITE_WRONG_CLUB') body.currentClubName = decision.currentClubName ?? null;
    if (decision.status === 410) body.invitationId = decision.invitationId;
    return NextResponse.json(body, { status: decision.status, headers: NO_STORE });
}

export async function POST(request) {
    try {
        const rate = consumeRateLimit(`invite-link:${getClientIdentifier(request)}`, { limit: 30, windowMs: 600000 });
        if (!rate.allowed) {
            const { status, body } = friendlyErrorPayload('RATE_LIMITED');
            return NextResponse.json(body, { status, headers: { ...NO_STORE, 'Retry-After': String(rate.retryAfterSeconds) } });
        }
        const body = await request.json().catch(() => null);
        const token = typeof body?.token === 'string' ? body.token : '';

        // Vé VĐV / phiên cộng đồng không tính: chỉ group_session đã xác thực.
        const session = await getValidatedGroupSessionFromCookies();
        if (!session) return respond(decideInviteLink({ session: null }), token);

        // Token sai định dạng → không truy vấn.
        let row = null;
        if (isInviteTokenShape(token)) {
            const { data, error } = await db.from('tournament_clubs')
                .select('id, club_id, group_id, tournament_id, invitation_status')
                .eq('invite_token_hash', hashInviteToken(token)).maybeSingle();
            if (error) throw error;
            row = data || null;
        }
        // Bước 1–4 chỉ cần phiên + dòng; giải/division CHỈ nạp khi đã đúng CLB và là admin.
        const early = decideInviteLink({ session, row, tournament: null, rosterLockStatus: null, now: new Date() });
        if (early.status !== 410) return respond(early, token);

        const [{ data: tournament, error: tournamentError }, { data: division, error: divisionError }] = await Promise.all([
            db.from('tournaments').select('id, settings').eq('id', row.tournament_id).eq('group_id', row.group_id).maybeSingle(),
            db.from('tournament_divisions').select('id, roster_lock_status')
                .eq('group_id', row.group_id).eq('tournament_id', row.tournament_id).eq('competition_template', FRIENDLY_DIVISION_TEMPLATE)
                .order('id').limit(1).maybeSingle(),
        ]);
        if (tournamentError || divisionError) throw tournamentError || divisionError;
        // Giải không còn / không phải giao hữu: link không hợp lệ (không lộ gì thêm).
        if (!tournament || tournament.settings?.organizer_mode !== 'friendly') {
            return respond({ status: 404, code: 'FRIENDLY_INVITE_LINK_INVALID' }, token);
        }
        return respond(decideInviteLink({ session, row, tournament, rosterLockStatus: division?.roster_lock_status, now: new Date() }), token);
    } catch (error) {
        console.error('Invite link resolve error:', error);
        return NextResponse.json({ error: 'Không mở được link mời. Thử lại sau.', code: 'FRIENDLY_READ_FAILED' }, { status: 500, headers: NO_STORE });
    }
}
