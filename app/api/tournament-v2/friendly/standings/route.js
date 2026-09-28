// BXH tổng CLB của giải giao hữu liên CLB (spec Epic 3 F2 §7.2, ADR-007 D40).
//   GET ?tournamentId=<id>       → chủ nhà: admin + thành viên CLB chủ nhà (requireTournamentAccess 'read').
//                                   Giải không phải friendly → 404 FRIENDLY_MODE_REQUIRED.
//   GET ?tournamentClubId=<id>   → admin CLB khách được mời (requireParticipantClubAccess: truy vấn lọc club_id = CLB
//                                   của phiên). Chỉ khi dòng đã duyệt và giải đã chốt; mọi trường hợp khác → 404
//                                   TOURNAMENT_NOT_FOUND (không lộ giải / CLB khác trước chốt).
// Response: { finalized, clubs: [{ tournamentClubId, name, color, isHost }], entryClubs: { entryId: tournamentClubId },
//             rows, headToHead, counts } — không group id của CLB, không thành viên, không logo.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess, requireParticipantClubAccess } from '@/lib/tournament/accessRuntime';
import { FRIENDLY_DIVISION_TEMPLATE, isFriendlyTournament, loadFriendlyClubStandings, positiveId } from '@/lib/tournament/friendlyServer';

const db = supabaseAdmin || supabaseServer;

const NOT_FOUND = { error: 'Không tìm thấy giải.', code: 'TOURNAMENT_NOT_FOUND' };
// Chủ nhà hỏi BXH CLB của giải nội bộ (spec §8). Câu riêng của route này; bảng F1 giữ 409 cho luồng mời.
const MODE_REQUIRED = { error: 'Giải này không phải giải giao hữu liên CLB.', code: 'FRIENDLY_MODE_REQUIRED' };

function noStore(body, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tournamentClubId = searchParams.get('tournamentClubId') ?? searchParams.get('tournament_club_id');
        const tournamentId = searchParams.get('tournamentId') ?? searchParams.get('tournament_id');

        let tournament;
        if (tournamentClubId != null) {
            if (!positiveId(tournamentClubId)) return noStore(NOT_FOUND, 404);
            const access = await requireParticipantClubAccess({ tournamentClubId });
            if (!access.ok) return access.response;
            if (access.row?.invitation_status !== 'approved') return noStore(NOT_FOUND, 404);
            const { data: division, error } = await db.from('tournament_divisions').select('id, roster_lock_status')
                .eq('group_id', Number(access.groupId)).eq('tournament_id', Number(access.tournament.id))
                .eq('competition_template', FRIENDLY_DIVISION_TEMPLATE).order('id').limit(1).maybeSingle();
            if (error) throw error;
            if (!division || division.roster_lock_status === 'open') return noStore(NOT_FOUND, 404);
            tournament = { id: access.tournament.id, group_id: access.tournament.group_id };
        } else {
            if (!positiveId(tournamentId)) {
                return noStore({ error: 'tournamentId hoặc tournamentClubId là bắt buộc.', code: 'SETUP_PAYLOAD_INVALID' }, 400);
            }
            const access = await requireTournamentAccess({ tournamentId: Number(tournamentId), need: 'read' });
            if (!access.ok) return access.response;
            const { data: row, error } = await db.from('tournaments').select('id, group_id, settings')
                .eq('id', Number(tournamentId)).eq('group_id', Number(access.tournament.group_id)).maybeSingle();
            if (error) throw error;
            if (!row) return noStore(NOT_FOUND, 404);
            if (!isFriendlyTournament(row)) return noStore(MODE_REQUIRED, 404);
            tournament = { id: row.id, group_id: row.group_id };
        }

        return noStore(await loadFriendlyClubStandings(db, { tournament }));
    } catch (error) {
        console.error('Friendly standings error:', error);
        return noStore({ error: 'Không thể tải bảng xếp hạng CLB.', code: 'FRIENDLY_READ_FAILED' }, 500);
    }
}
