import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireGroupAdmin } from '@/lib/groupSession';
import { getScheduleEngine } from '@/lib/tournament/engines';
import { scheduleToInsertRows, resolveParentLinks } from '@/lib/tournament/persistence';

const db = supabaseAdmin || supabaseServer;

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

        // 3. Delete existing matches for this stage (regenerate); games cascade via FK
        const { error: delErr } = await db
            .from('tournament_matches')
            .delete()
            .eq('group_id', groupId)
            .eq('stage_id', stageId);
        if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
        }

        // 4. Generate schedule via engine
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

        // 5. Insert matches
        const rows = scheduleToInsertRows(sched, { stageId, groupId });
        const { data: inserted, error: insErr } = await db
            .from('tournament_matches')
            .insert(rows)
            .select('id, round, bracket_slot');
        if (insErr) {
            return NextResponse.json({ error: insErr.message }, { status: 500 });
        }

        // 6. Resolve parent links (map local slot -> real id) and set parent_match_id
        const links = resolveParentLinks(sched, inserted || []);
        for (const link of links) {
            const { error: linkErr } = await db
                .from('tournament_matches')
                .update({ parent_match_id: link.parent_match_id })
                .eq('id', link.id)
                .eq('group_id', groupId);
            if (linkErr) {
                return NextResponse.json({ error: linkErr.message }, { status: 500 });
            }
        }

        // 7. Mark stage active
        const { error: stageUpdErr } = await db
            .from('tournament_stages')
            .update({ status: 'active' })
            .eq('id', stageId)
            .eq('group_id', groupId);
        if (stageUpdErr) {
            return NextResponse.json({ error: stageUpdErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, matchCount: rows.length });
    } catch (err) {
        console.error('Generate v2 POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
