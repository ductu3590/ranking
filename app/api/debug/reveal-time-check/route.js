import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { debugGuard } from '@/lib/debugGuard';

// Debug-only route: never prerender or run in production.
export const dynamic = 'force-dynamic';

// GET /api/debug/reveal-time-check
export async function GET() {
    const blocked = debugGuard();
    if (blocked) return blocked;
    try {
        // 1. Get the reveal time setting
        const { data: setting, error } = await supabase
            .from('tournament_settings')
            .select('*')
            .eq('setting_key', 'round1_reveal_time')
            .single();

        if (error) throw error;

        const revealTime = setting?.setting_value;
        const now = new Date();
        const reveal = new Date(revealTime);

        console.log('=== REVEAL TIME DEBUG ===');
        console.log('Setting value:', revealTime);
        console.log('Current time:', now.toISOString());
        console.log('Reveal time:', reveal.toISOString());
        console.log('now >= reveal:', now >= reveal);
        console.log('Should reveal:', now >= reveal);

        return NextResponse.json({
            success: true,
            debug: {
                settingValue: revealTime,
                currentTime: now.toISOString(),
                revealTime: reveal.toISOString(),
                currentTimeMs: now.getTime(),
                revealTimeMs: reveal.getTime(),
                difference: now.getTime() - reveal.getTime(),
                shouldReveal: now >= reveal,
                Setting_from_db: setting
            }
        });

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
