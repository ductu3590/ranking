import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        // Verify admin authentication
        const authHeader = request.headers.get('authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get current lock status
        const { data: currentSetting, error: fetchError } = await supabaseAdmin
            .from('tournament_settings')
            .select('setting_value')
            .eq('setting_key', 'pairings_locked')
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
                setting_key: 'pairings_locked',
                setting_value: newLocked,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'tournament_id,setting_key'
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
        const { data, error } = await supabaseAdmin
            .from('tournament_settings')
            .select('setting_value')
            .eq('setting_key', 'pairings_locked')
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
