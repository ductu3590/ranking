import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase } from '@/lib/groupSession';

export async function GET() {
    const groupId = getGroupIdForDatabase();

    const [teamsRes, matchesRes, pairingsRes, playersRes] = await Promise.all([
        supabaseAdmin
            .from('tournament_teams')
            .select('*')
            .eq('group_id', groupId)
            .order('team_code', { ascending: true }),
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
                player1:tournament_players!tournament_pairings_player1_id_fkey(player_name),
                player2:tournament_players!tournament_pairings_player2_id_fkey(player_name)
            `)
            .eq('group_id', groupId)
            .order('round', { ascending: true })
            .order('team_code', { ascending: true })
            .order('pair_order', { ascending: true }),
        supabaseAdmin
            .from('tournament_players')
            .select('*')
            .eq('group_id', groupId)
            .eq('is_active', true)
            .order('display_order', { ascending: true }),
    ]);

    const matches = matchesRes.data || [];
    const pairings = pairingsRes.data || [];
    const players = playersRes.data || [];
    const teams = (teamsRes.data || []).map((team) => ({
        ...team,
        players: players.filter((player) => player.team_id === team.id),
    }));
    const stats = {
        totalPlayers: players.length,
        totalMatches: matches.length,
        completedMatches: matches.filter((m) => m.match_status === 'completed').length,
        pendingSubmissions: pairings.filter((p) => p.submission_status === 'draft').length,
    };

    return NextResponse.json({ teams, matches, pairings, stats });
}
