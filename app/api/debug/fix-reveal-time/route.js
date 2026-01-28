import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// POST /api/debug/fix-reveal-time
export async function POST() {
    try {
        // Update the setting - store as plain text in JSONB
        const newRevealTime = '2026-01-28T16:30:00+07:00';

        const { data, error } = await supabase
            .from('tournament_settings')
            .update({
                setting_value: newRevealTime, // Supabase will auto-convert to JSONB
                updated_at: new Date().toISOString()
            })
            .eq('tournament_id', 1)
            .eq('setting_key', 'round1_reveal_time')
            .select();

        if (error) throw error;

        // Verify the update
        const { data: check } = await supabase
            .from('tournament_settings')
            .select('*')
            .eq('setting_key', 'round1_reveal_time')
            .single();

        return NextResponse.json({
            success: true,
            message: 'Updated reveal time',
            updated: data,
            verified: check,
            valueType: typeof check?.setting_value,
            valueString: JSON.stringify(check?.setting_value)
        });

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
