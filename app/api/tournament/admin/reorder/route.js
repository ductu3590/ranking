import { supabaseServer } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// PUT - Reorder pairings (Admin only)
export async function PUT(request) {
    try {
        const body = await request.json();
        const { round, teamCode, newOrder } = body;

        // TODO: Add admin authentication
        // Validate input
        if (!round || !teamCode || !Array.isArray(newOrder)) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        // Update pair_order for each pairing
        const updates = newOrder.map(async (item, index) => {
            const { error } = await supabaseServer
                .from('tournament_pairings')
                .update({ pair_order: index + 1 })
                .eq('id', item.id)
                .eq('round', round)
                .eq('team_code', teamCode);

            if (error) throw error;
        });

        await Promise.all(updates);

        // Fetch updated pairings
        const { data: updatedPairings, error: fetchError } = await supabaseServer
            .from('tournament_pairings')
            .select(`
                *,
                player1:tournament_players!tournament_pairings_player1_id_fkey(id, full_name),
                player2:tournament_players!tournament_pairings_player2_id_fkey(id, full_name)
            `)
            .eq('round', round)
            .eq('team_code', teamCode)
            .order('pair_order', { ascending: true });

        if (fetchError) throw fetchError;

        // Now update tournament_matches to reflect new pairing order
        // For Round 2 & 3, matches reference pairings by pair_order
        // We need to ensure match.blue_pair_id and match.red_pair_id point to correct pairings

        // Fetch current round matches
        const { data: matches, error: matchError } = await supabaseServer
            .from('tournament_matches')
            .select('*')
            .eq('round', round);

        if (matchError) throw matchError;

        // Update matches to sync with new pairing order
        const matchUpdates = matches.map(async (match) => {
            // Get blue and red pairings by their new order
            const bluePairing = updatedPairings.find(p =>
                p.team_code === 'blue' && p.pair_order === match.match_order
            );
            const redPairing = updatedPairings.find(p =>
                p.team_code === 'red' && p.pair_order === match.match_order
            );

            if (bluePairing && redPairing) {
                const { error: updateError } = await supabaseServer
                    .from('tournament_matches')
                    .update({
                        blue_pair_id: bluePairing.id,
                        red_pair_id: redPairing.id
                    })
                    .eq('id', match.id);

                if (updateError) throw updateError;
            }
        });

        await Promise.all(matchUpdates);

        return NextResponse.json({
            success: true,
            pairings: updatedPairings,
            message: 'Pairing order updated successfully'
        });
    } catch (err) {
        console.error('Reorder error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
