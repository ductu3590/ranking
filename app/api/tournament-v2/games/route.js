import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireGroupAdmin } from '@/lib/groupSession';
import { getMatchEngine } from '@/lib/tournament/engines';
import { advanceWinner } from '@/lib/tournament/results';

const db = supabaseAdmin || supabaseServer;

async function handleGames(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;

        const body = await request.json();
        const matchId = body?.matchId;
        const games = Array.isArray(body?.games) ? body.games : [];
        if (!matchId) {
            return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
        }

        // 2. Load match + its stage
        const { data: match, error: matchErr } = await db
            .from('tournament_matches')
            .select('*')
            .eq('id', matchId)
            .eq('group_id', groupId)
            .single();
        if (matchErr || !match) {
            return NextResponse.json({ error: 'Match không tồn tại' }, { status: 404 });
        }

        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('match_format, config')
            .eq('id', match.stage_id)
            .eq('group_id', groupId)
            .single();
        if (stageErr || !stage) {
            return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });
        }

        // 3. Replace games
        const { error: delErr } = await db
            .from('tournament_games')
            .delete()
            .eq('group_id', groupId)
            .eq('match_id', matchId);
        if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
        }

        if (games.length) {
            const gameRows = games.map((g, idx) => ({
                group_id: groupId,
                match_id: matchId,
                game_no: g.game_no || (idx + 1),
                kind: g.kind || 'game',
                score_a: Number(g.score_a) || 0,
                score_b: Number(g.score_b) || 0,
                lineup: g.lineup || {},
            }));
            const { error: insErr } = await db
                .from('tournament_games')
                .insert(gameRows);
            if (insErr) {
                return NextResponse.json({ error: insErr.message }, { status: 500 });
            }
        }

        // 4. Resolve match via engine
        let engine;
        try {
            engine = getMatchEngine(stage.match_format);
        } catch (e) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        let r;
        try {
            r = engine.resolveMatch(
                { entrant_a_id: match.entrant_a_id, entrant_b_id: match.entrant_b_id },
                games,
                stage.config || {},
            );
        } catch (e) {
            console.error('Resolve match engine error:', e);
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        // 5. Persist outcome
        if (r.complete) {
            const { error: updErr } = await db
                .from('tournament_matches')
                .update({ winner_entrant_id: r.winner_entrant_id, status: 'done' })
                .eq('id', matchId)
                .eq('group_id', groupId);
            if (updErr) {
                return NextResponse.json({ error: updErr.message }, { status: 500 });
            }

            const adv = advanceWinner({
                winner_entrant_id: r.winner_entrant_id,
                parent_match_id: match.parent_match_id,
                bracket_slot: match.bracket_slot,
            });
            if (adv) {
                const { error: advErr } = await db
                    .from('tournament_matches')
                    .update({ [adv.field]: adv.entrant_id })
                    .eq('id', adv.parent_match_id)
                    .eq('group_id', groupId);
                if (advErr) {
                    return NextResponse.json({ error: advErr.message }, { status: 500 });
                }
            }
        } else {
            const { error: updErr } = await db
                .from('tournament_matches')
                .update({ status: 'live', winner_entrant_id: null })
                .eq('id', matchId)
                .eq('group_id', groupId);
            if (updErr) {
                return NextResponse.json({ error: updErr.message }, { status: 500 });
            }
        }

        return NextResponse.json({
            success: true,
            complete: r.complete,
            winner_entrant_id: r.complete ? r.winner_entrant_id : null,
        });
    } catch (err) {
        console.error('Games v2 PUT error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request) {
    return handleGames(request);
}

export async function POST(request) {
    return handleGames(request);
}
