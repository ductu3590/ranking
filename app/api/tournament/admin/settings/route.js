import { supabaseServer } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// GET - Fetch tournament settings
export async function GET(request) {
    try {
        const { data: settings, error } = await supabaseServer
            .from('tournament_settings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ settings: settings || null });
    } catch (err) {
        console.error('Settings GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST - Update tournament settings (Admin only)
export async function POST(request) {
    try {
        const body = await request.json();
        const {
            tournament_name,
            tournament_date,
            start_time,
            end_time,
            total_courts,
            match_duration_minutes,
            break_duration_minutes,
            round1_reveal_time,
            is_active
        } = body;

        // TODO: Add admin authentication check here
        // const { data: { user } } = await supabase.auth.getUser();
        // if (!user || user.user_metadata?.role !== 'admin') {
        //     return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        // }

        // Check if settings exist
        const { data: existing } = await supabaseServer
            .from('tournament_settings')
            .select('id')
            .limit(1)
            .single();

        let result;
        if (existing) {
            // Update existing settings
            const { data, error } = await supabaseServer
                .from('tournament_settings')
                .update({
                    tournament_name,
                    tournament_date,
                    start_time,
                    end_time,
                    total_courts,
                    match_duration_minutes,
                    break_duration_minutes,
                    round1_reveal_time,
                    is_active,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) throw error;
            result = data;
        } else {
            // Insert new settings
            const { data, error } = await supabaseServer
                .from('tournament_settings')
                .insert([{
                    tournament_name,
                    tournament_date,
                    start_time,
                    end_time,
                    total_courts,
                    match_duration_minutes,
                    break_duration_minutes,
                    round1_reveal_time,
                    is_active
                }])
                .select()
                .single();

            if (error) throw error;
            result = data;
        }

        return NextResponse.json({ success: true, settings: result });
    } catch (err) {
        console.error('Settings POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
