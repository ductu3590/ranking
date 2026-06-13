import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { validatePairings } from '@/lib/tournamentHelpers';
import { getGroupIdForDatabase } from '@/lib/groupSession';

// GET /api/tournament/captain/pairings?round=1&team=blue
// Fetch pairings for a specific team and round
export async function GET(request) {
    try {
        const groupId = getGroupIdForDatabase();
        const { searchParams } = new URL(request.url);
        const round = parseInt(searchParams.get('round')) || 1;
        const teamCode = searchParams.get('team');

        if (!teamCode) {
            return NextResponse.json(
                { success: false, error: 'Team code required' },
                { status: 400 }
            );
        }

        // Get team ID
        const { data: team } = await supabase
            .from('tournament_teams')
            .select('id')
            .eq('team_code', teamCode)
            .eq('group_id', groupId)
            .single();

        if (!team) {
            return NextResponse.json(
                { success: false, error: 'Team not found' },
                { status: 404 }
            );
        }

        // Fetch pairings with player details
        const { data: pairings, error } = await supabase
            .from('tournament_pairings')
            .select(`
        *,
        player1:tournament_players!tournament_pairings_player1_id_fkey(*),
        player2:tournament_players!tournament_pairings_player2_id_fkey(*)
            `)
            .eq('team_id', team.id)
            .eq('group_id', groupId)
            .eq('round_number', round)
            .order('pair_order');

        if (error) throw error;

        return NextResponse.json({
            success: true,
            pairings: pairings || []
        });

    } catch (error) {
        console.error('Error fetching pairings:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// POST /api/tournament/captain/pairings
// Save or update pairings (draft mode)
export async function POST(request) {
    try {
        const groupId = getGroupIdForDatabase();
        const body = await request.json();
        const { teamCode, round, pairings } = body;

        if (!teamCode || !round || !pairings) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Get team ID
        const { data: team } = await supabase
            .from('tournament_teams')
            .select('id')
            .eq('team_code', teamCode)
            .eq('group_id', groupId)
            .single();

        if (!team) {
            return NextResponse.json(
                { success: false, error: 'Team not found' },
                { status: 404 }
            );
        }

        // Get previous rounds for validation
        const { data: previousPairings } = await supabase
            .from('tournament_pairings')
            .select('*')
            .eq('team_id', team.id)
            .eq('group_id', groupId)
            .lt('round_number', round);

        // Validate pairings
        const validation = validatePairings(round, pairings, previousPairings || []);
        if (!validation.valid) {
            return NextResponse.json(
                { success: false, error: validation.errors.join(', ') },
                { status: 400 }
            );
        }

        // Delete existing pairings for this round (if any)
        await supabase
            .from('tournament_pairings')
            .delete()
            .eq('team_id', team.id)
            .eq('group_id', groupId)
            .eq('round_number', round);

        // Insert new pairings
        const pairingsToInsert = pairings.map((pair, index) => ({
            tournament_id: 1,
            group_id: groupId,
            team_id: team.id,
            round_number: round,
            pair_order: index + 1,
            player1_id: pair.player1_id,
            player2_id: pair.player2_id,
            status: 'draft',
            is_hidden: round === 1 // Round 1 is hidden by default
        }));

        const { data, error } = await supabase
            .from('tournament_pairings')
            .insert(pairingsToInsert)
            .select();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: 'Lưu cặp đôi thành công',
            pairings: data
        });

    } catch (error) {
        console.error('Error saving pairings:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// PUT /api/tournament/captain/pairings/submit
// Submit and lock pairings
export async function PUT(request) {
    try {
        const groupId = getGroupIdForDatabase();
        const body = await request.json();
        const { teamCode, round } = body;

        if (!teamCode || !round) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Get team ID
        const { data: team } = await supabase
            .from('tournament_teams')
            .select('id')
            .eq('team_code', teamCode)
            .eq('group_id', groupId)
            .single();

        if (!team) {
            return NextResponse.json(
                { success: false, error: 'Team not found' },
                { status: 404 }
            );
        }

        // Update status to 'submitted'
        const { data, error } = await supabase
            .from('tournament_pairings')
            .update({
                status: 'submitted',
                submitted_at: new Date().toISOString()
            })
            .eq('team_id', team.id)
            .eq('group_id', groupId)
            .eq('round_number', round)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Chưa có cặp đôi nào để nộp' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Đã nộp danh sách thành công',
            pairings: data
        });

    } catch (error) {
        console.error('Error submitting pairings:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
