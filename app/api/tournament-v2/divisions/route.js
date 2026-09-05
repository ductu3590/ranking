import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';
import { validateDivisionOptions } from '@/lib/tournament/interclub';
import { buildDivisionPayload } from '@/lib/tournament/wizardModel';

const db = supabaseAdmin || supabaseServer;

const SELECT_FIELDS = 'id, group_id, tournament_id, name, play_type, entrant_type, scoring_scope, rating_policy, rating_cap, pairing_mode, capacity, competition_template, ruleset_version, registration_status, scheduling_status, competition_status, scoring_override, tiebreak_override';

function domainError(error) {
    if (!error?.code || !/^[A-Z_]+$/.test(error.code)) return null;
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
}

export async function GET(request) {
    try {
        const scope = getClubScope();
        if (!scope.ok) return scope.response;
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
        }
        const { data, error } = await db
            .from('tournament_divisions')
            .select(SELECT_FIELDS)
            .eq('group_id', scope.groupId)
            .eq('tournament_id', tournamentId)
            .order('id', { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ divisions: data || [] });
    } catch (err) {
        console.error('Divisions GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const body = await request.json();
        if (!body?.tournament_id) {
            return NextResponse.json({ error: 'tournament_id là bắt buộc' }, { status: 400 });
        }

        let payload;
        try {
            payload = buildDivisionPayload(body);
        } catch (error) {
            const response = domainError(error);
            if (response) return response;
            throw error;
        }

        const { data: tournament, error: tournamentError } = await db
            .from('tournaments')
            .select('id')
            .eq('id', body.tournament_id)
            .eq('group_id', adminCheck.groupId)
            .maybeSingle();
        if (tournamentError) throw tournamentError;
        if (!tournament) return NextResponse.json({ error: 'Không tìm thấy giải trong CLB hiện tại' }, { status: 404 });

        const { data, error } = await db
            .from('tournament_divisions')
            .insert({ ...payload, group_id: adminCheck.groupId, tournament_id: body.tournament_id })
            .select(SELECT_FIELDS)
            .single();
        if (error) {
            const duplicate = error.code === '23505';
            return NextResponse.json(
                { error: duplicate ? 'Tên nội dung đã tồn tại trong giải' : error.message },
                { status: duplicate ? 409 : 500 },
            );
        }
        return NextResponse.json({ success: true, division: data });
    } catch (err) {
        console.error('Divisions POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const body = await request.json();
        if (!body?.id) return NextResponse.json({ error: 'id là bắt buộc' }, { status: 400 });

        const { data: current, error: currentError } = await db
            .from('tournament_divisions')
            .select(SELECT_FIELDS)
            .eq('id', body.id)
            .eq('group_id', adminCheck.groupId)
            .maybeSingle();
        if (currentError) throw currentError;
        if (!current) return NextResponse.json({ error: 'Không tìm thấy nội dung thi đấu' }, { status: 404 });

        const merged = { ...current, ...body };
        let payload;
        try {
            payload = buildDivisionPayload(merged);
            // Ràng buộc DB: play_type và entrant_type phải khớp cặp đã quy định.
            validateDivisionOptions(payload);
        } catch (error) {
            const response = domainError(error);
            if (response) return response;
            throw error;
        }

        const { data, error } = await db
            .from('tournament_divisions')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', body.id)
            .eq('group_id', adminCheck.groupId)
            .select(SELECT_FIELDS)
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, division: data });
    } catch (err) {
        console.error('Divisions PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id là bắt buộc' }, { status: 400 });
        const { error } = await db
            .from('tournament_divisions')
            .delete()
            .eq('id', id)
            .eq('group_id', adminCheck.groupId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Divisions DELETE error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
