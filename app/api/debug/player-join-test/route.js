import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { debugGuard } from '@/lib/debugGuard';

// Debug-only route: never prerender or run in production.
export const dynamic = 'force-dynamic';

// GET /api/debug/player-join-test
export async function GET() {
    const blocked = debugGuard();
    if (blocked) return blocked;
    try {
        console.log('=== TESTING PLAYER JOINS ===');

        // Test with player joins - exact same as live API
        const { data: withPlayers, error } = await supabase
            .from('tournament_pairings')
            .select(`
                *,
                team:tournament_teams(*),
                player1:tournament_players!tournament_pairings_player1_id_fkey(*),
                player2:tournament_players!tournament_pairings_player2_id_fkey(*)
            `)
            .eq('tournament_id', 1)
            .eq('status', 'submitted')
            .order('round_number')
            .order('pair_order');

        console.log('Pairings with players:', withPlayers?.length || 0);
        if (error) {
            console.error('Error:', error);
        }

        return NextResponse.json({
            success: true,
            count: withPlayers?.length || 0,
            error: error?.message,
            sample: withPlayers?.[0],
            allTeamCodes: withPlayers?.map(p => p.team?.team_code)
        });

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
