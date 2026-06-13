import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { debugGuard } from '@/lib/debugGuard';

// Debug-only route: never prerender or run in production.
export const dynamic = 'force-dynamic';

// GET /api/debug/check-setting
export async function GET() {
    const blocked = debugGuard();
    if (blocked) return blocked;
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
