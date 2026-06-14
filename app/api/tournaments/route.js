import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getTournaments } from '@/lib/tournaments';
import { requireGroupAdmin } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

export async function GET() {
    const result = await getTournaments();
    return NextResponse.json(result);
}

export async function POST(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const body = await request.json();
        const name = body.name?.trim();

        if (!name) {
            return NextResponse.json({ error: 'Tournament name is required' }, { status: 400 });
        }

        const payload = {
            group_id: adminCheck.groupId,
            name,
            description: body.description?.trim() || null,
            event_date: body.event_date || null,
            status: body.status || 'draft',
            location: body.location?.trim() || null,
        };

        const { data, error } = await db
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
