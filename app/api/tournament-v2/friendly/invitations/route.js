// Hộp lời mời của CLB KHÁCH (spec Epic 3 F1 §6.2). Admin CLB của phiên:
//   GET → { invitations: [{ id, tournament, hostClub, status, statusLabel, quota, pairCount, window, finalized, publicUrl }] }
// Chỉ dòng tournament_clubs có club_id = CLB của phiên (lọc trong truy vấn), của giải friendly do CLB KHÁC tổ chức.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import {
    GUEST_CLUB_FIELDS,
    GUEST_TOURNAMENT_FIELDS,
    guestInvitationView,
    guestListItem,
    sortGuestInvitations,
    loadFriendlyDivisions,
    loadGroupNames,
} from '@/lib/tournament/friendlyServer';

const db = supabaseAdmin || supabaseServer;

// Dữ liệu theo phiên: không bao giờ render tĩnh / cache.
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = Number(adminCheck.groupId);

        const { data: rows, error } = await db.from('tournament_clubs')
            .select(GUEST_CLUB_FIELDS)
            .eq('club_id', groupId).neq('group_id', groupId)
            .order('id', { ascending: false }).limit(200);
        if (error) throw error;
        if (!rows?.length) return NextResponse.json({ invitations: [] });

        const tournamentIds = [...new Set(rows.map((row) => row.tournament_id))];
        const { data: tournaments, error: tournamentsError } = await db.from('tournaments')
            .select(GUEST_TOURNAMENT_FIELDS).in('id', tournamentIds);
        if (tournamentsError) throw tournamentsError;
        const tournamentById = new Map((tournaments || [])
            .filter((tournament) => tournament.settings?.organizer_mode === 'friendly')
            .map((tournament) => [String(tournament.id), tournament]));
        // Dòng phải khớp tenant chủ nhà của chính giải đó.
        const visible = rows.filter((row) => {
            const tournament = tournamentById.get(String(row.tournament_id));
            return tournament && String(tournament.group_id) === String(row.group_id);
        });
        const [divisions, hosts] = await Promise.all([
            loadFriendlyDivisions(db, visible.map((row) => row.tournament_id)),
            loadGroupNames(db, visible.map((row) => row.group_id)),
        ]);
        const now = new Date();
        const views = visible.map((row) => {
            const tournament = tournamentById.get(String(row.tournament_id));
            const division = divisions.get(String(row.tournament_id));
            return guestInvitationView({
                row,
                tournament,
                hostClub: { name: hosts.get(String(row.group_id))?.name ?? null },
                division: division && String(division.group_id) === String(row.group_id) ? division : null,
                now,
            });
        });
        return NextResponse.json({ invitations: sortGuestInvitations(views).map(guestListItem) });
    } catch (error) {
        console.error('Friendly invitations GET error:', error);
        return NextResponse.json({ error: 'Không tải được lời mời.', code: 'FRIENDLY_READ_FAILED' }, { status: 500 });
    }
}
