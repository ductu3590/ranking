import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getEffectiveGroupContext } from '@/lib/groupSession';
import { getScheduleEngine, getMatchEngine } from '@/lib/tournament/engines';
import { buildResolvedMatches } from '@/lib/tournament/results';

const db = supabaseAdmin || supabaseServer;

// Load entrants + resolvedMatches + raw matches for a group-scoped stage.
async function loadStageData(stage, groupId) {
    const stageId = stage.id;

    // entrants: prefer stage_entrants (with seed override), else fall back to tournament_entrants.
    let entrants = [];
    const { data: stageEntrants, error: seErr } = await db
        .from('tournament_stage_entrants')
        .select('entrant_id, seed_in_stage, group_label')
        .eq('group_id', groupId)
        .eq('stage_id', stageId);
    if (seErr) return { error: { message: seErr.message, status: 500 } };

    if (stageEntrants && stageEntrants.length) {
        // Look up base seed from tournament_entrants for any null seed_in_stage.
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

    // matches
    const { data: matches, error: mErr } = await db
        .from('tournament_matches')
        .select('*')
        .eq('group_id', groupId)
        .eq('stage_id', stageId);
    if (mErr) return { error: { message: mErr.message, status: 500 } };
    const matchList = matches || [];

    // games grouped by match_id
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

export async function GET(request) {
    try {
        const ctx = getEffectiveGroupContext();
        const groupId = ctx.group_id;

        const { searchParams } = new URL(request.url);
        const stageId = searchParams.get('stageId');
        if (!stageId) {
            return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
        }

        // 1. Load stage group-scoped
        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('*')
            .eq('id', stageId)
            .eq('group_id', groupId)
            .single();
        if (stageErr || !stage) {
            return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });
        }

        // 2. Build entrants + resolvedMatches
        let loaded;
        try {
            loaded = await loadStageData(stage, groupId);
        } catch (e) {
            console.error('Standings load/match-engine error:', e);
            return NextResponse.json({ error: e.message }, { status: 400 });
        }
        if (loaded.error) {
            return NextResponse.json({ error: loaded.error.message }, { status: loaded.error.status });
        }

        // 3. Compute standings via schedule engine
        let scheduleEngine;
        try {
            scheduleEngine = getScheduleEngine(stage.schedule_format);
        } catch (e) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        let standings;
        try {
            standings = scheduleEngine.computeStandings(
                { schedule_format: stage.schedule_format, config: stage.config || {} },
                loaded.entrants,
                loaded.resolved,
            );
        } catch (e) {
            console.error('computeStandings engine error:', e);
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        return NextResponse.json({ schedule_format: stage.schedule_format, standings });
    } catch (err) {
        console.error('Standings v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
