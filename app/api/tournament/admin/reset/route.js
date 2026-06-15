import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';

export async function POST(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const groupId = adminCheck.groupId;

    const body = await request.json().catch(() => ({}));
    const tournamentId = Number(body?.tournamentId);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
        return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
    }

    for (const table of ['tournament_matches', 'tournament_pairings', 'tournament_players', 'tournament_teams', 'tournament_settings']) {
        const { error } = await supabaseAdmin
            .from(table)
            .delete()
            .eq('group_id', groupId)
            .eq('tournament_id', tournamentId);
        if (error) {
            return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
        }
    }
    return NextResponse.json({ ok: true });
}
