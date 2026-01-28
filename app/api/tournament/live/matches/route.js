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
        const { matchId, blueScore, redScore, status, isReset } = body;

        if (!matchId) {
            return NextResponse.json(
                { success: false, error: 'Match ID required' },
                { status: 400 }
            );
        }

        let updateData = {
            updated_at: new Date().toISOString()
        };

        if (isReset) {
            // Reset match to initial state
            updateData = {
                ...updateData,
                blue_score: null,
                red_score: null,
                match_status: 'pending',
                winner_team: null
            };
        } else {
            // Determine winner
            let winner = null;
            if (status === 'completed' && blueScore != null && redScore != null) {
                if (blueScore !== redScore) {
                    winner = blueScore > redScore ? 'blue' : 'red';
                }
                // If blueScore === redScore, winner stays null (tie)
            }

            if (blueScore != null) updateData.blue_score = blueScore;
            if (redScore != null) updateData.red_score = redScore;
            if (status) updateData.match_status = status;
            if (winner) updateData.winner_team = winner;
        }

        console.log('[UPDATE MATCH] Updating match:', matchId);
        console.log('[UPDATE MATCH] Update data:', updateData);

        const { data, error } = await supabase
            .from('tournament_matches')
            .update(updateData)
            .eq('id', matchId)
            .select()
            .single();

        if (error) {
            console.error('[UPDATE MATCH] Database error:', error);
            throw error;
        }

        console.log('[UPDATE MATCH] Update successful:', data);

        return NextResponse.json({
            success: true,
            message: isReset ? 'Đã xoá tỉ số' : 'Cập nhật điểm số thành công',
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
