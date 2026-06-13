import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { getGroupIdForDatabase } from '@/lib/groupSession';

// POST /api/tournament/captain/pairings/unlock
// Unlock submitted pairings for editing
export async function POST(request) {
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

        // Update status back to 'draft'
        const { data, error } = await supabase
            .from('tournament_pairings')
            .update({
                status: 'draft',
                submitted_at: null
            })
            .eq('team_id', team.id)
            .eq('group_id', groupId)
            .eq('round_number', round)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Không tìm thấy danh sách để mở khóa' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Đã mở khóa danh sách để chỉnh sửa',
            pairings: data
        });

    } catch (error) {
        console.error('Error unlocking pairings:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
