import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { canRevealRound1 } from '@/lib/tournamentHelpers';

// GET /api/tournament/live/pairings
// Fetch all pairings for public display (filter hidden Round 1 if not time)
export async function GET() {
    try {
        // Get reveal time setting
        const { data: revealSetting } = await supabase
            .from('tournament_settings')
            .select('setting_value')
            .eq('setting_key', 'round1_reveal_time')
            .single();

        const canReveal = canRevealRound1(revealSetting?.setting_value);

        // Fetch all pairings with player details
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

        if (error) throw error;

        // Filter out Round 1 if still hidden
        const filteredPairings = (pairings || []).filter(pairing => {
            if (pairing.round_number === 1 && pairing.is_hidden && !canReveal) {
                return false;
            }
            return true;
        });

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

        filteredPairings.forEach(pairing => {
            const teamCode = pairing.team.team_code;
            const roundKey = `round${pairing.round_number}`;
            groupedPairings[teamCode][roundKey].push(pairing);
        });

        return NextResponse.json({
            success: true,
            canRevealRound1: canReveal,
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
