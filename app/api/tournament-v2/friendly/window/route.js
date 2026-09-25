// Hạn chót / khoá đăng ký của giải giao hữu (spec Epic 3 F1 §6.1, D42). Chủ nhà:
//   POST { tournament_id, deadline: ISO có múi giờ | null, locked: boolean } → { window }
// Ghi qua RPC set_friendly_registration_window (gộp settings.friendly, không ghi đè khoá khác).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { parseDeadlineInput, registrationWindow } from '@/lib/tournament/friendlyClubs';
import { positiveId, friendlyErrorPayload, rpcErrorPayload } from '@/lib/tournament/friendlyServer';

const db = supabaseAdmin || supabaseServer;

function reply({ status, body }) {
    return NextResponse.json(body, { status });
}

export async function POST(request) {
    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(friendlyErrorPayload('SETUP_PAYLOAD_INVALID'));
        const tournamentId = positiveId(body.tournament_id);
        if (!tournamentId || typeof body.locked !== 'boolean') return reply(friendlyErrorPayload('SETUP_PAYLOAD_INVALID'));
        const deadline = parseDeadlineInput(body.deadline);
        if (!deadline.ok) return reply(friendlyErrorPayload(deadline.code));

        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;

        const { data, error } = await db.rpc('set_friendly_registration_window', {
            p_group_id: Number(access.groupId),
            p_tournament_id: tournamentId,
            p_deadline: deadline.deadline,
            p_locked: body.locked,
        });
        if (error) {
            const payload = rpcErrorPayload(error);
            if (payload.status >= 500) console.error('set_friendly_registration_window error:', error);
            return reply(payload);
        }
        // RPC chỉ ghi khi giải friendly và division còn 'open' → dựng cửa sổ từ đúng hai điều kiện đó.
        const window = registrationWindow({
            settings: { organizer_mode: 'friendly', friendly: data || {} },
            rosterLockStatus: 'open',
            now: new Date(),
        });
        return NextResponse.json({ window });
    } catch (error) {
        console.error('Friendly window POST error:', error);
        return NextResponse.json({ error: 'Không cập nhật được hạn đăng ký.', code: 'FRIENDLY_MUTATION_FAILED' }, { status: 500 });
    }
}
