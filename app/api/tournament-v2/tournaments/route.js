import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireGroupAdmin, getEffectiveGroupContext } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

const ALLOWED_TOURNAMENT_FIELDS = [
    'name',
    'description',
    'event_date',
    'status',
    'location',
    'entrant_type',
    'public_slug',
    'settings',
];

function buildTournamentPayload(body, groupId) {
    const payload = {};
    for (const field of ALLOWED_TOURNAMENT_FIELDS) {
        if (!(field in body)) continue;
        if (['name', 'description', 'location'].includes(field)) {
            payload[field] = String(body[field] || '').trim() || null;
        } else if (field === 'entrant_type') {
            payload[field] = body[field] || 'pair';
        } else if (field === 'settings') {
            payload[field] = body[field] || {};
        } else {
            payload[field] = body[field] || null;
        }
    }

    if (groupId) {
        payload.group_id = groupId;
    }
    payload.updated_at = new Date().toISOString();
    return payload;
}

function slugify(name) {
    return String(name || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function generateSlug(name) {
    const base = slugify(name) || 'giai';
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base}-${suffix}`;
}

export async function GET() {
    try {
        const { group_id: groupId } = getEffectiveGroupContext();

        const { data, error } = await db
            .from('tournaments')
            .select('*')
            .eq('group_id', groupId)
            .order('event_date', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ tournaments: data || [] });
    } catch (err) {
        console.error('Tournaments v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
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

        const payload = buildTournamentPayload({
            ...body,
            name,
            status: body.status || 'draft',
            entrant_type: body.entrant_type || 'pair',
            settings: body.settings || {},
            public_slug: body.public_slug || generateSlug(name),
        }, adminCheck.groupId);

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
        console.error('Tournaments v2 POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const body = await request.json();
        const id = body?.id;
        if (!id) {
            return NextResponse.json({ error: 'Tournament id is required' }, { status: 400 });
        }

        const payload = buildTournamentPayload(body);
        delete payload.group_id;
        if (payload.name === null) {
            return NextResponse.json({ error: 'Tournament name is required' }, { status: 400 });
        }

        const { data, error } = await db
            .from('tournaments')
            .update(payload)
            .eq('id', id)
            .eq('group_id', adminCheck.groupId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, tournament: data });
    } catch (err) {
        console.error('Tournaments v2 PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Tournament id is required' }, { status: 400 });
        }

        const { error } = await db
            .from('tournaments')
            .delete()
            .eq('id', id)
            .eq('group_id', adminCheck.groupId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Tournaments v2 DELETE error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
