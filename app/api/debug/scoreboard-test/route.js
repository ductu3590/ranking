import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { calculateTeamScore } from '@/lib/tournamentHelpers';
import { debugGuard } from '@/lib/debugGuard';

// Debug-only route: never prerender or run in production.
export const dynamic = 'force-dynamic';

// GET /api/debug/scoreboard-test
// Debug endpoint to test scoreboard calculation
export async function GET() {
    const blocked = debugGuard();
    if (blocked) return blocked;
    try {
        // Fetch all matches
        const { data: matches, error } = await supabase
            .from('tournament_matches')
            .select('*')
            .eq('tournament_id', 1);

        if (error) throw error;

        console.log('============ SCOREBOARD DEBUG ============');
        console.log('Total matches:', matches?.length);

        // Log each match
        matches?.forEach((match, i) => {
            console.log(`\nMatch ${i + 1}:`, {
                id: match.id,
                round_number: match.round_number,
                match_status: match.match_status,
                blue_score: match.blue_score,
                red_score: match.red_score,
                winner_team: match.winner_team,
                status_type: typeof match.match_status,
                winner_type: typeof match.winner_team
            });
        });

        // Calculate scores
        const blueScore = calculateTeamScore(matches || [], 'blue');
        const redScore = calculateTeamScore(matches || [], 'red');

        console.log('\nFinal scores:');
        console.log('Blue:', blueScore);
        console.log('Red:', redScore);
        console.log('========================================');

        return NextResponse.json({
            success: true,
            debug: {
                totalMatches: matches?.length,
                matches: matches?.map(m => ({
                    id: m.id,
                    round: m.round_number,
                    status: m.match_status,
                    blue: m.blue_score,
                    red: m.red_score,
                    winner: m.winner_team
                })),
                blueScore,
                redScore
            }
        });

    } catch (error) {
        console.error('Debug error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
