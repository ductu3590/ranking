import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// GET /api/tournament/live/matches
// Fetch match schedule with pairings and scores
export async function GET() {
    try {
        // Fetch all matches with pairing details
        const { data: matches, error } = await supabase
            .from('tournament_matches')
            .select(`
        *,
        blue_pairing:tournament_pairings!tournament_matches_blue_pair_id_fkey(
          *,
          player1:tournament_players!tournament_pairings_player1_id_fkey(*),
          player2:tournament_players!tournament_pairings_player2_id_fkey(*)
        ),
        red_pairing:tournament_pairings!tournament_matches_red_pair_id_fkey(
          *,
          player1:tournament_players!tournament_pairings_player1_id_fkey(*),
          player2:tournament_players!tournament_pairings_player2_id_fkey(*)
        )
      `)
            .eq('tournament_id', 1)
            .order('match_number');

        if (error) throw error;

        return NextResponse.json({
            success: true,
            matches: matches || []
        });

    } catch (error) {
        console.error('Error fetching matches:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// POST /api/tournament/live/matches/[id]/score
// Update match score (admin only)
export async function POST(request) {
    try {
        const body = await request.json();
        const { matchId, blueScore, redScore, status } = body;

        if (!matchId) {
            return NextResponse.json(
                { success: false, error: 'Match ID required' },
                { status: 400 }
            );
        }

        // Determine winner
        let winner = null;
        if (status === 'completed' && blueScore != null && redScore != null) {
            winner = blueScore > redScore ? 'blue' : 'red';
        }

        // Update match
        const updateData = {
            updated_at: new Date().toISOString()
        };

        if (blueScore != null) updateData.blue_score = blueScore;
        if (redScore != null) updateData.red_score = redScore;
        if (status) updateData.match_status = status;
        if (winner) updateData.winner_team = winner;

        const { data, error } = await supabase
            .from('tournament_matches')
            .update(updateData)
            .eq('id', matchId)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: 'Cập nhật điểm số thành công',
            match: data
        });

    } catch (error) {
        console.error('Error updating match score:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
