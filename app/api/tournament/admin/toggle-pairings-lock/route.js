import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';
import { getGroupIdForDatabase, requireGroupAdmin } from '@/lib/groupSession';

export async function POST(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = getGroupIdForDatabase();

        // Get current lock status
        const { data: currentSetting, error: fetchError } = await supabaseAdmin
            .from('tournament_settings')
            .select('setting_value')
            .eq('setting_key', 'pairings_locked')
            .eq('group_id', groupId)
            .single();

        if (fetchError) {
            console.error('Error fetching lock status:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch lock status' }, { status: 500 });
        }

        // Toggle the lock
        const currentLocked = currentSetting?.setting_value === true || currentSetting?.setting_value === 'true';
        const newLocked = !currentLocked;

        // Update the setting
        const { error: updateError } = await supabaseAdmin
            .from('tournament_settings')
            .upsert({
                tournament_id: 1,
                group_id: groupId,
                setting_key: 'pairings_locked',
                setting_value: newLocked,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'group_id,tournament_id,setting_key'
            });

        if (updateError) {
            console.error('Error updating lock status:', updateError);
            return NextResponse.json({ error: 'Failed to update lock status' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            locked: newLocked,
            message: newLocked ? 'Pairings locked' : 'Pairings unlocked'
        });

    } catch (error) {
        console.error('Toggle lock error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET endpoint to check lock status
export async function GET() {
    try {
        const groupId = getGroupIdForDatabase();
        const { data, error } = await supabaseAdmin
            .from('tournament_settings')
            .select('setting_value')
            .eq('setting_key', 'pairings_locked')
            .eq('group_id', groupId)
            .single();

        if (error) {
            console.error('Error fetching lock status:', error);
            return NextResponse.json({ locked: false });
        }

        const locked = data?.setting_value === true || data?.setting_value === 'true';
        return NextResponse.json({ locked });

    } catch (error) {
        console.error('Get lock status error:', error);
        return NextResponse.json({ locked: false });
    }
}
