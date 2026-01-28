import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { canRevealRound1 } from '@/lib/tournamentHelpers';

export const dynamic = 'force-dynamic';


// GET /api/tournament/live/pairings
// Fetch all pairings for public display (filter hidden Round 1 if not time)
export async function GET() {
    try {
        // Check if we're past the deadline (16:30)
        const now = new Date();
        const deadline = new Date('2026-01-28T16:30:00+07:00');
        const isPastDeadline = now >= deadline;

        // Check which teams have submitted Round 1
        const { data: blueTeam } = await supabase
            .from('tournament_teams')
            .select('id')
            .eq('team_code', 'blue')
            .single();

        const { data: redTeam } = await supabase
            .from('tournament_teams')
            .select('id')
            .eq('team_code', 'red')
            .single();

        // Check if RED team has submitted Round 1
        const { data: redSubmission } = await supabase
            .from('tournament_pairings')
            .select('id')
            .eq('team_id', redTeam?.id)
            .eq('round_number', 1)
            .eq('status', 'submitted')
            .limit(1);

        const redHasSubmitted = redSubmission && redSubmission.length > 0;

        // Reveal logic:
        // - If past 16:30 deadline: reveal all
        // - If RED team submitted: reveal all
        // - Otherwise: hide BLUE team (keep it blurred)
        // const canReveal = isPastDeadline || redHasSubmitted;
        const canReveal = true; // FORCED UNLOCK by Admin request


        console.log('[LIVE API] Past deadline:', isPastDeadline);
        console.log('[LIVE API] RED team submitted:', redHasSubmitted);
        console.log('[LIVE API] Can reveal:', canReveal);

        // Fetch all pairings with player details
        const { data: pairings, error } = await supabase
            .from('tournament_pairings')
            .select(`
                *,
                team:tournament_teams(*),
                player1:tournament_players!player1_id(*),
                player2:tournament_players!player2_id(*)
            `)
            .eq('tournament_id', 1)
            .eq('status', 'submitted')
            .order('round_number')
            .order('pair_order');

        if (error) throw error;

        // Group by team and round
        const groupedPairings = {
            blue: {
                round1: [],
                round2: [],
                round3: []
            },
            red: {
                round1: [],
                round2: [],
                round3: []
            }
        };

        (pairings || []).forEach(pairing => {
            const teamCode = pairing.team?.team_code;
            const roundKey = `round${pairing.round_number}`;
            if (teamCode && groupedPairings[teamCode]) {
                groupedPairings[teamCode][roundKey].push(pairing);
            }
        });


        return NextResponse.json({
            success: true,
            canRevealRound1: canReveal,
            isPastDeadline: isPastDeadline,
            redHasSubmitted: redHasSubmitted,
            pairings: groupedPairings
        });

    } catch (error) {
        console.error('Error fetching live pairings:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
