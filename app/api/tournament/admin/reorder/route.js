import { supabaseServer } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { getGroupIdForDatabase, requireGroupAdmin } from '@/lib/groupSession';

// PUT - Reorder pairings (Admin only)
export async function PUT(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = getGroupIdForDatabase();
        const body = await request.json();
        const { round, teamCode, newOrder } = body;

        // Validate input
        if (!round || !teamCode || !Array.isArray(newOrder)) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        const tournamentId = Number(body?.tournamentId);
        if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }

        // 1. Get Team ID first
        const { data: teamData, error: teamError } = await supabaseServer
            .from('tournament_teams')
            .select('id')
            .eq('team_code', teamCode)
            .eq('group_id', groupId)
            .eq('tournament_id', tournamentId)
            .single();

        if (teamError || !teamData) {
            throw new Error(`Team not found for code: ${teamCode}`);
        }
        const teamId = teamData.id;

        // 2. Update pair_order for each pairing
        // We only use ID to identify the row to update, avoiding column errors
        // 2. Update pair_order safely to avoid Unique Constraint violation (swapping 1 <-> 2)
        // Strategy: First set all to negative/temporary values, then set to correct values.

        // Phase 1: Set to temporary negative values (Admin must drop CHECK constraint for this to work)
        const tempUpdates = newOrder.map(async (item, index) => {
            const { error } = await supabaseServer
                .from('tournament_pairings')
                .update({ pair_order: -1 * (index + 1) }) // -1, -2, -3...
                .eq('id', item.id)
                .eq('group_id', groupId)
                .eq('tournament_id', tournamentId);
            if (error) throw error;
        });
        await Promise.all(tempUpdates);

        // Phase 2: Set to final positive values
        const finalUpdates = newOrder.map(async (item, index) => {
            const { error } = await supabaseServer
                .from('tournament_pairings')
                .update({ pair_order: index + 1 })
                .eq('id', item.id)
                .eq('group_id', groupId)
                .eq('tournament_id', tournamentId);
            if (error) throw error;
        });
        await Promise.all(finalUpdates);

        // 3. (Optional) We could update tournament_matches links here,
        // but since the Frontend now dynamically calculates matches based on Pairings,
        // we can skip this complex and error-prone step to avoid further column issues.
        // The frontend is the source of truth for "Who fights who" based on order.

        return NextResponse.json({
            success: true,
            message: 'Pairing order updated successfully'
        });

    } catch (err) {
        console.error('Reorder error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
