import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { getGroupIdForDatabase, requireGroupAdmin } from '@/lib/groupSession';

// POST /api/tournament/admin/toggle-round1
// Toggle visibility of Round 1 pairings
export async function POST(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = getGroupIdForDatabase();
        const { reveal } = await request.json();

        // Update setting - use simple boolean instead of timestamp
        const { error } = await supabase
            .from('tournament_settings')
            .upsert({
                tournament_id: 1,
                group_id: groupId,
                setting_key: 'round1_revealed',
                setting_value: reveal, // true or false
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'group_id,tournament_id,setting_key'
            });

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: reveal ? 'Round 1 revealed' : 'Round 1 hidden',
            revealed: reveal
        });

    } catch (error) {
        console.error('Error toggling Round 1:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// GET - Check current state
export async function GET() {
    try {
        const groupId = getGroupIdForDatabase();
        const { data } = await supabase
            .from('tournament_settings')
            .select('setting_value')
            .eq('setting_key', 'round1_revealed')
            .eq('group_id', groupId)
            .single();

        return NextResponse.json({
            success: true,
            revealed: data?.setting_value === true || data?.setting_value === 'true'
        });

    } catch (error) {
        return NextResponse.json({
            success: true,
            revealed: false // Default to hidden
        });
    }
}
