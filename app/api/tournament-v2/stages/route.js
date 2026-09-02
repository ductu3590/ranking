import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireGroupAdmin, getClubScope } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

const ALLOWED_STAGE_FIELDS = [
    'tournament_id',
    'stage_order',
    'name',
    'schedule_format',
    'match_format',
    'status',
    'config',
];

const SCHEDULE_FORMATS = ['round_robin', 'knockout'];
const MATCH_FORMATS = ['simple', 'mlp'];
const STAGE_STATUSES = ['pending', 'active', 'completed'];

function validateStage(body) {
    if ('schedule_format' in body && !SCHEDULE_FORMATS.includes(body.schedule_format)) {
        return `schedule_format không hợp lệ (chỉ ${SCHEDULE_FORMATS.join(', ')})`;
    }
    if ('match_format' in body && body.match_format && !MATCH_FORMATS.includes(body.match_format)) {
        return `match_format không hợp lệ (chỉ ${MATCH_FORMATS.join(', ')})`;
    }
    if ('status' in body && body.status && !STAGE_STATUSES.includes(body.status)) {
        return `status không hợp lệ (chỉ ${STAGE_STATUSES.join(', ')})`;
    }
    return null;
}

function buildStagePayload(body, groupId) {
    const payload = {};
    for (const field of ALLOWED_STAGE_FIELDS) {
        if (!(field in body)) continue;
        if (field === 'name') {
            payload[field] = String(body[field] || '').trim() || null;
        } else if (field === 'config') {
            payload[field] = body[field] || {};
        } else if (field === 'stage_order') {
            payload[field] = Number(body[field]) || null;
        } else {
            payload[field] = body[field] || null;
        }
    }
    if (groupId) {
        payload.group_id = groupId;
    }
    // tournament_stages không có cột updated_at (migration 015) — không ghi.
    return payload;
}

export async function GET(request) {
    try {
        const scope = getClubScope();
        if (!scope.ok) return scope.response;
        const groupId = scope.groupId;
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }

        const { data, error } = await db
            .from('tournament_stages')
            .select('*')
            .eq('group_id', groupId)
            .eq('tournament_id', tournamentId)
            .order('stage_order', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ stages: data || [] });
    } catch (err) {
        console.error('Stages v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const body = await request.json();
        const tournamentId = body.tournament_id;
        const name = body.name?.trim();
        const scheduleFormat = body.schedule_format;

        if (!tournamentId) {
            return NextResponse.json({ error: 'tournament_id is required' }, { status: 400 });
        }
        if (!name) {
            return NextResponse.json({ error: 'Stage name is required' }, { status: 400 });
        }
        if (!scheduleFormat) {
            return NextResponse.json({ error: 'schedule_format is required' }, { status: 400 });
        }

        const validationError = validateStage(body);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        let stageOrder = Number(body.stage_order) || null;
        if (!stageOrder) {
            const { data: existing, error: existingErr } = await db
                .from('tournament_stages')
                .select('stage_order')
                .eq('group_id', adminCheck.groupId)
                .eq('tournament_id', tournamentId)
                .order('stage_order', { ascending: false })
                .limit(1);
            if (existingErr) {
                return NextResponse.json({ error: existingErr.message }, { status: 500 });
            }
            stageOrder = existing && existing.length ? Number(existing[0].stage_order) + 1 : 1;
        }

        const payload = buildStagePayload({
            ...body,
            name,
            stage_order: stageOrder,
            match_format: body.match_format || 'simple',
            status: body.status || 'pending',
            config: body.config || {},
        }, adminCheck.groupId);

        const { data, error } = await db
            .from('tournament_stages')
            .insert(payload)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, stage: data });
    } catch (err) {
        console.error('Stages v2 POST error:', err);
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
            return NextResponse.json({ error: 'Stage id is required' }, { status: 400 });
        }

        const validationError = validateStage(body);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const payload = buildStagePayload(body);
        delete payload.group_id;
        delete payload.tournament_id;

        const { data, error } = await db
            .from('tournament_stages')
            .update(payload)
            .eq('id', id)
            .eq('group_id', adminCheck.groupId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, stage: data });
    } catch (err) {
        console.error('Stages v2 PATCH error:', err);
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
            return NextResponse.json({ error: 'Stage id is required' }, { status: 400 });
        }

        const { error } = await db
            .from('tournament_stages')
            .delete()
            .eq('id', id)
            .eq('group_id', adminCheck.groupId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Stages v2 DELETE error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
