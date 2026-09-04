import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { getScheduleEngine, getMatchEngine } from '@/lib/tournament/engines';
import { buildResolvedMatches } from '@/lib/tournament/results';
import { isStageComplete, seedNextStage } from '@/lib/tournament/orchestrator';

const db = supabaseAdmin || supabaseServer;

function rpcErrorResponse(error) {
    const code = error?.code;
    const status = code === '40001' ? 409 : code === '22023' ? 400 : code === 'P0002' ? 404 : 500;
    const message = code === '40001'
        ? 'Stage đã thay đổi, hãy tải lại.'
        : error?.message || 'Không thể chuyển stage.';
    return NextResponse.json({ error: message, code: code || 'MUTATION_FAILED' }, { status });
}

// Load entrants + resolvedMatches + raw matches for a group-scoped stage.
async function loadStageData(stage, groupId) {
    const stageId = stage.id;

    let entrants = [];
    const { data: stageEntrants, error: seErr } = await db
        .from('tournament_stage_entrants')
        .select('entrant_id, seed_in_stage, group_label')
        .eq('group_id', groupId)
        .eq('stage_id', stageId);
    if (seErr) return { error: { message: seErr.message, status: 500 } };

    if (stageEntrants && stageEntrants.length) {
        const { data: baseEntrants, error: beErr } = await db
            .from('tournament_entrants')
            .select('id, seed')
            .eq('group_id', groupId)
            .eq('tournament_id', stage.tournament_id);
        if (beErr) return { error: { message: beErr.message, status: 500 } };
        const seedById = {};
        for (const e of baseEntrants || []) seedById[e.id] = e.seed;
        entrants = stageEntrants.map((r) => ({
            id: r.entrant_id,
            seed: r.seed_in_stage != null ? r.seed_in_stage : seedById[r.entrant_id],
            group_label: r.group_label,
        }));
    } else {
        const { data: tEntrants, error: teErr } = await db
            .from('tournament_entrants')
            .select('id, seed')
            .eq('group_id', groupId)
            .eq('tournament_id', stage.tournament_id);
        if (teErr) return { error: { message: teErr.message, status: 500 } };
        entrants = (tEntrants || []).map((r) => ({ id: r.id, seed: r.seed }));
    }

    const { data: matches, error: mErr } = await db
        .from('tournament_matches')
        .select('*')
        .eq('group_id', groupId)
        .eq('stage_id', stageId);
    if (mErr) return { error: { message: mErr.message, status: 500 } };
    const matchList = matches || [];

    const gamesByMatchId = {};
    const matchIds = matchList.map((m) => m.id);
    if (matchIds.length) {
        const { data: games, error: gErr } = await db
            .from('tournament_games')
            .select('match_id, score_a, score_b, kind, game_no')
            .eq('group_id', groupId)
            .in('match_id', matchIds);
        if (gErr) return { error: { message: gErr.message, status: 500 } };
        for (const g of games || []) {
            if (!gamesByMatchId[g.match_id]) gamesByMatchId[g.match_id] = [];
            gamesByMatchId[g.match_id].push({
                score_a: g.score_a,
                score_b: g.score_b,
                kind: g.kind,
                game_no: g.game_no,
            });
        }
    }

    const matchEngine = getMatchEngine(stage.match_format);
    const resolved = buildResolvedMatches(matchList, gamesByMatchId, matchEngine, stage.config || {});

    return { entrants, resolved, matches: matchList };
}

export async function POST(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;

        const body = await request.json();
        const stageId = body?.stageId;
        if (!stageId) {
            return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
        }
        const idempotencyKey = String(
            body?.idempotency_key || body?.idempotencyKey || randomUUID(),
        ).trim();
        if (!idempotencyKey || idempotencyKey.length > 200) {
            return NextResponse.json({ error: 'idempotency_key không hợp lệ' }, { status: 400 });
        }

        // 1. Load current stage group-scoped
        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('*')
            .eq('id', stageId)
            .eq('group_id', groupId)
            .single();
        if (stageErr || !stage) {
            return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });
        }

        // 2. Build entrants + resolvedMatches + matches
        let loaded;
        try {
            loaded = await loadStageData(stage, groupId);
        } catch (e) {
            console.error('Advance load/match-engine error:', e);
            return NextResponse.json({ error: e.message }, { status: 400 });
        }
        if (loaded.error) {
            return NextResponse.json({ error: loaded.error.message }, { status: loaded.error.status });
        }

        if (!isStageComplete(loaded.matches)) {
            return NextResponse.json({ error: 'Stage chưa hoàn tất' }, { status: 400 });
        }

        // 3. Compute standings before advancing
        let scheduleEngine;
        try {
            scheduleEngine = getScheduleEngine(stage.schedule_format);
        } catch (e) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        let standings;
        let seeded;
        try {
            standings = scheduleEngine.computeStandings(
                { schedule_format: stage.schedule_format, config: stage.config || {} },
                loaded.entrants,
                loaded.resolved,
            );
            // 4. Seed next stage from standings
            seeded = seedNextStage(
                { schedule_format: stage.schedule_format, config: stage.config || {} },
                standings,
            );
        } catch (e) {
            console.error('Advance engine error:', e);
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        // 5. Find next stage
        const { data: nextStage, error: nextErr } = await db
            .from('tournament_stages')
            .select('id, stage_order')
            .eq('group_id', groupId)
            .eq('tournament_id', stage.tournament_id)
            .eq('stage_order', stage.stage_order + 1)
            .single();

        if (nextErr && nextErr.code !== 'PGRST116') {
            return NextResponse.json({ error: nextErr.message }, { status: 500 });
        }

        // 6. Commit finalization + next-stage seedings atomically in PostgreSQL.
        const { data, error } = await db.rpc('advance_tournament_stage', {
            p_group_id: groupId,
            p_stage_id: stage.id,
            p_next_stage_id: nextStage?.id || null,
            p_seeded: seeded,
            p_idempotency_key: idempotencyKey,
        });
        if (error) return rpcErrorResponse(error);

        return NextResponse.json(data || {
            success: true,
            ...(nextStage ? { nextStageId: nextStage.id, advanced: seeded.length } : {
                final: true,
                champion: seeded,
            }),
        });
    } catch (err) {
        console.error('Advance v2 POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
