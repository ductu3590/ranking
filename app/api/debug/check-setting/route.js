import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// GET /api/debug/check-setting
export async function GET() {
    try {
        // Get the raw setting
        const { data, error } = await supabase
            .from('tournament_settings')
            .select('*')
            .eq('setting_key', 'round1_reveal_time');

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data: data,
            firstValue: data?.[0]?.setting_value,
            type: typeof data?.[0]?.setting_value,
            asString: JSON.stringify(data?.[0]?.setting_value)
        });

    } catch (error) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
