import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { DEFAULT_TOURNAMENT } from '@/lib/tournamentDefaults';

export async function GET() {
    try {
        const { data, error } = await supabaseServer
            .from('tournaments')
            .select('*')
            .order('event_date', { ascending: false });

        if (error) {
            console.warn('Tournaments table unavailable, using default tournament:', error.message);
            return NextResponse.json({ tournaments: [DEFAULT_TOURNAMENT], fallback: true });
        }

        return NextResponse.json({
            tournaments: data?.length ? data : [DEFAULT_TOURNAMENT],
            fallback: !data?.length,
        });
    } catch (err) {
        console.error('Tournaments GET error:', err);
        return NextResponse.json({ tournaments: [DEFAULT_TOURNAMENT], fallback: true });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const name = body.name?.trim();

        if (!name) {
            return NextResponse.json({ error: 'Tournament name is required' }, { status: 400 });
        }

        const payload = {
            name,
            description: body.description?.trim() || null,
            event_date: body.event_date || null,
            status: body.status || 'draft',
            location: body.location?.trim() || null,
        };

        const { data, error } = await supabaseServer
            .from('tournaments')
            .insert(payload)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, tournament: data });
    } catch (err) {
        console.error('Tournaments POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

