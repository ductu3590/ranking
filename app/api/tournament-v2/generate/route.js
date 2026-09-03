import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireGroupAdmin } from '@/lib/groupSession';
import { getScheduleEngine } from '@/lib/tournament/engines';
import { scheduleToInsertRows } from '@/lib/tournament/persistence';

const db = supabaseAdmin || supabaseServer;

function rpcErrorResponse(error) {
    const code = error?.code;
    const status = code === '40001' ? 409 : code === '22023' ? 400 : code === 'P0002' ? 404 : 500;
    const message = code === '40001' ? 'Lịch thi đấu đã thay đổi, hãy tải lại.' : error?.message || 'Không sinh được lịch.';
    return NextResponse.json({ error: message, code: code || 'MUTATION_FAILED' }, { status });
}

export async function POST(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;

        const body = await request.json();
        const stageId = body?.stageId;
        const seed = body?.seed;
        if (!stageId) {
            return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
        }

        // 1. Load stage
        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('*')
            .eq('id', stageId)
            .eq('group_id', groupId)
            .single();
        if (stageErr || !stage) {
            return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });
        }

        // 2. Get entrants for the stage
        let entrants = [];
        const { data: stageEntrants, error: seErr } = await db
            .from('tournament_stage_entrants')
            .select('entrant_id, seed_in_stage, group_label')
            .eq('group_id', groupId)
            .eq('stage_id', stageId);
        if (seErr) {
            return NextResponse.json({ error: seErr.message }, { status: 500 });
        }

        if (stageEntrants && stageEntrants.length) {
            entrants = stageEntrants.map((r) => ({
                id: r.entrant_id,
                seed: r.seed_in_stage,
                group_label: r.group_label,
            }));
        } else {
            const { data: tEntrants, error: teErr } = await db
                .from('tournament_entrants')
                .select('id, seed')
                .eq('group_id', groupId)
                .eq('tournament_id', stage.tournament_id);
            if (teErr) {
                return NextResponse.json({ error: teErr.message }, { status: 500 });
            }
            entrants = (tEntrants || []).map((r) => ({ id: r.id, seed: r.seed }));
        }

        if (entrants.length < 2) {
            return NextResponse.json({ error: 'Cần ít nhất 2 đội' }, { status: 400 });
        }

        // 3. Generate and validate the schedule before entering the database transaction.
        let engine;
        try {
            engine = getScheduleEngine(stage.schedule_format);
        } catch (e) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        let sched;
        try {
            sched = engine.generateSchedule(
                { schedule_format: stage.schedule_format, config: stage.config || {} },
                entrants,
                seed || 1,
            );
        } catch (e) {
            console.error('Generate schedule engine error:', e);
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        const rows = scheduleToInsertRows(sched, { stageId, groupId });
        const rpcMatches = rows.map((row, index) => ({
            ...row,
            _key: String(sched[index].slot != null ? sched[index].slot : index),
            _parent_key: sched[index].parent_slot != null ? String(sched[index].parent_slot) : null,
        }));
        const idempotencyKey = String(
            body?.idempotency_key || body?.idempotencyKey || randomUUID(),
        ).trim();
        if (!idempotencyKey || idempotencyKey.length > 200) {
            return NextResponse.json({ error: 'idempotency_key không hợp lệ' }, { status: 400 });
        }

        const { data, error } = await db.rpc('replace_tournament_schedule', {
            p_group_id: groupId,
            p_stage_id: stageId,
            p_matches: rpcMatches,
            p_idempotency_key: idempotencyKey,
        });
        if (error) return rpcErrorResponse(error);
        return NextResponse.json({ ...(data || { success: true }), matchCount: data?.matchCount ?? rows.length });
    } catch (err) {
        console.error('Generate v2 POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
