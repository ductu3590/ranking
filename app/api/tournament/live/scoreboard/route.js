import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { getGroupIdForDatabase } from '@/lib/groupSession';
import { NextResponse } from 'next/server';
import { calculateTeamScore } from '@/lib/tournamentHelpers';

// Force dynamic rendering and disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/tournament/live/scoreboard
// Calculate and return team scores
export async function GET() {
    try {
        const groupId = getGroupIdForDatabase();
        // Fetch all matches - USE EXACT SAME QUERY AS /api/tournament/live/matches
        const { data: matches, error } = await supabase
            .from('tournament_matches')
            .select('*')
            .eq('tournament_id', 1)
            .eq('group_id', groupId)
            .order('match_number'); // Add order to prevent caching issues

        if (error) {
            console.error('[Scoreboard API] Database error:', error);
            throw error;
        }

        console.log('[Scoreboard API] Total matches:', matches?.length);
        console.log('[Scoreboard API] Matches:', JSON.stringify(matches?.map(m => ({
            id: m.id,
            round: m.round_number,
            status: m.match_status,
            blue_score: m.blue_score,
            red_score: m.red_score,
            winner: m.winner_team
        })), null, 2));

        // Calculate scores for both teams
        const blueScore = calculateTeamScore(matches || [], 'blue');
        const redScore = calculateTeamScore(matches || [], 'red');

        console.log('[Scoreboard API] Blue score:', blueScore);
        console.log('[Scoreboard API] Red score:', redScore);

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
