import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase } from '@/lib/groupSession';

export async function GET() {
    const groupId = getGroupIdForDatabase();

    const [matchesRes, pairingsRes, playersRes] = await Promise.all([
        supabaseAdmin
            .from('tournament_matches')
            .select('*')
            .eq('group_id', groupId)
            .order('round', { ascending: true })
            .order('match_order', { ascending: true }),
        supabaseAdmin
            .from('tournament_pairings')
            .select(`
                *,
                player1:tournament_players!tournament_pairings_player1_id_fkey(full_name),
                player2:tournament_players!tournament_pairings_player2_id_fkey(full_name)
            `)
            .eq('group_id', groupId)
            .order('round', { ascending: true })
            .order('team_code', { ascending: true })
            .order('pair_order', { ascending: true }),
        supabaseAdmin
            .from('tournament_players')
            .select('id')
            .eq('group_id', groupId),
    ]);

    const matches = matchesRes.data || [];
    const pairings = pairingsRes.data || [];
    const stats = {
        totalPlayers: (playersRes.data || []).length,
        totalMatches: matches.length,
        completedMatches: matches.filter((m) => m.match_status === 'completed').length,
        pendingSubmissions: pairings.filter((p) => p.submission_status === 'draft').length,
    };

    return NextResponse.json({ matches, pairings, stats });
}
