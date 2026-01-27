import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { calculateTeamScore } from '@/lib/tournamentHelpers';

// GET /api/tournament/live/scoreboard
// Calculate and return team scores
export async function GET() {
    try {
        // Fetch all completed matches
        const { data: matches, error } = await supabase
            .from('tournament_matches')
            .select('*')
            .eq('tournament_id', 1);

        if (error) throw error;

        // Calculate scores for both teams
        const blueScore = calculateTeamScore(matches || [], 'blue');
        const redScore = calculateTeamScore(matches || [], 'red');

        // Determine leader
        const leader = blueScore.total > redScore.total ? 'blue' :
            redScore.total > blueScore.total ? 'red' :
                null;

        return NextResponse.json({
            success: true,
            scoreboard: {
                blue: blueScore,
                red: redScore,
                leader
            }
        });

    } catch (error) {
        console.error('Error calculating scoreboard:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
