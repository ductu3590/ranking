import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';

const SENTINEL = '00000000-0000-0000-0000-000000000000';

export async function POST() {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const groupId = adminCheck.groupId;

    for (const table of ['tournament_matches', 'tournament_pairings', 'tournament_players', 'tournament_teams']) {
        const { error } = await supabaseAdmin
            .from(table)
            .delete()
            .eq('group_id', groupId)
            .neq('id', SENTINEL);
        if (error) {
            return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
        }
    }
    return NextResponse.json({ ok: true });
}
