import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// GET /api/debug/live-pairings-test
export async function GET() {
    try {
        console.log('=== DEBUG LIVE PAIRINGS TEST ===');

        // Fetch all pairings
        const { data: pairings, error } = await supabase
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

        if (error) {
            console.error('Database error:', error);
            throw error;
        }

        console.log('Raw pairings count:', pairings?.length || 0);

        const result = {
            totalPairings: pairings?.length || 0,
            pairings: pairings?.map(p => ({
                id: p.id,
                round: p.round_number,
                team_code: p.team?.team_code,
                team_name: p.team?.team_name,
                status: p.status,
                is_hidden: p.is_hidden,
                player1: p.player1?.player_name,
                player2: p.player2?.player_name
            }))
        };

        console.log('Result:', JSON.stringify(result, null, 2));

        return NextResponse.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
