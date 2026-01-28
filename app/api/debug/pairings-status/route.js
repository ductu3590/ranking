import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// GET /api/debug/pairings-status
// Debug endpoint to check all pairings status
export async function GET() {
    try {
        // Fetch all pairings with full details
        const { data: pairings, error } = await supabase
            .from('tournament_pairings')
            .select(`
                *,
                team:tournament_teams(*),
                player1:tournament_players!tournament_pairings_player1_id_fkey(*),
                player2:tournament_players!tournament_pairings_player2_id_fkey(*)
            `)
            .order('round_number')
            .order('team_id')
            .order('pair_order');

        if (error) throw error;

        // Group by team and round
        const grouped = {};

        pairings.forEach(p => {
            const teamCode = p.team.team_code;
            const round = p.round_number;

            if (!grouped[teamCode]) {
                grouped[teamCode] = {};
            }

            if (!grouped[teamCode][`round${round}`]) {
                grouped[teamCode][`round${round}`] = [];
            }

            grouped[teamCode][`round${round}`].push({
                id: p.id,
                pair_order: p.pair_order,
                player1: p.player1?.player_name || 'N/A',
                player2: p.player2?.player_name || 'N/A',
                status: p.status,
                is_hidden: p.is_hidden,
                submitted_at: p.submitted_at,
                created_at: p.created_at
            });
        });

        return NextResponse.json({
            success: true,
            total: pairings.length,
            pairings: grouped,
            raw: pairings
        }, {
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        });

    } catch (error) {
        console.error('Error fetching debug pairings:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
