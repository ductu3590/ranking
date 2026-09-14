import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';
import { getAthleteClubContext } from '@/lib/clubReadContext';
import {
    createFundEventShareToken,
    presentFundEvent,
    resolveFundEventScope,
} from '@/lib/fundEventShare';

const EVENT_SELECT = `
    *,
    fund_event_participants!fund_event_participants_event_id_fkey (
        id,
        member_id,
        has_paid,
        paid_at,
        notes,
        club_members!fund_event_participants_member_id_fkey ( id, full_name, is_active )
    )
`;

// Trả 404 (không phải 403) khi không có quyền, để người ngoài không dò được
// id sự kiện nào đang tồn tại.
const NOT_FOUND = { error: 'Không tìm thấy sự kiện.' };

export async function GET(request, { params }) {
    const eventId = Number(params?.id);
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
        return NextResponse.json({ error: 'Id sự kiện không hợp lệ.' }, { status: 400 });
    }

    const secret = process.env.GROUP_SESSION_SECRET || '';
    const token = new URL(request.url).searchParams.get('t');

    const { data: event, error } = await supabaseAdmin
        .from('fund_events')
        .select(EVENT_SELECT)
        .eq('id', eventId)
        .maybeSingle();
    if (error) {
        console.error('[club/events/:id] không đọc được sự kiện', error);
        return NextResponse.json({ error: 'Không tải được sự kiện.' }, { status: 500 });
    }
    if (!event) {
        return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    // Phiên CLB khớp group_id → xem đầy đủ; chỉ cầm token chia sẻ → bản che tên.
    // Vé VĐV (athlete_session) đã đối chiếu DB cũng là người đọc trong CLB. Cả hai
    // nhánh đều KHÔNG rơi về CLB mặc định — đó chính là lỗ hổng đang vá.
    const session = (await getAthleteClubContext())
        || (await getValidatedGroupSessionFromCookies());
    const scope = resolveFundEventScope({ event, session, token, secret });
    if (!scope) {
        return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    const payload = { event: presentFundEvent(event, scope), scope };
    if (scope === 'club' && secret) {
        payload.share_token = createFundEventShareToken(
            { groupId: event.group_id, eventId: event.id },
            secret,
        );
    }
    return NextResponse.json(payload);
}
