import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getTournaments } from '@/lib/tournaments';
import { requireGroupAdmin } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

const ALLOWED_TOURNAMENT_FIELDS = [
    'name',
    'description',
    'event_date',
    'status',
    'location',
    'tournament_format',
    'assignment_mode',
    'team_size',
    'teams_per_match',
    'scoring_config',
];

function buildTournamentPayload(body, groupId) {
    const payload = {};
    for (const field of ALLOWED_TOURNAMENT_FIELDS) {
        if (!(field in body)) continue;
        if (['name', 'description', 'location'].includes(field)) {
            payload[field] = String(body[field] || '').trim() || null;
        } else if (['team_size', 'teams_per_match'].includes(field)) {
            payload[field] = Number(body[field]) || null;
        } else {
            payload[field] = body[field] || null;
        }
    }

    if (payload.name) {
        payload.name = String(payload.name).trim();
    }
    if (groupId) {
        payload.group_id = groupId;
    }
    payload.updated_at = new Date().toISOString();
    return payload;
}

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

        const payload = buildTournamentPayload({
            ...body,
            name,
            status: body.status || 'draft',
            tournament_format: body.tournament_format || 'mlp_team',
            assignment_mode: body.assignment_mode || 'random',
            team_size: body.team_size || 4,
            teams_per_match: body.teams_per_match || 2,
            scoring_config: body.scoring_config || {},
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
        console.error('Tournaments POST error:', err);
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
        console.error('Tournaments PATCH error:', err);
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

        for (const table of ['tournament_matches', 'tournament_pairings', 'tournament_players', 'tournament_teams', 'tournament_settings']) {
            const { error } = await db
                .from(table)
                .delete()
                .eq('group_id', adminCheck.groupId)
                .eq('tournament_id', id);
            if (error) {
                return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
            }
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
        console.error('Tournaments DELETE error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
