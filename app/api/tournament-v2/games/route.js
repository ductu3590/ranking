import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireGroupAdmin } from '@/lib/groupSession';
import { getMatchEngine } from '@/lib/tournament/engines';
import { advanceWinner } from '@/lib/tournament/results';

const db = supabaseAdmin || supabaseServer;

function rpcErrorResponse(error) {
    const code = error?.code;
    const status = code === '40001' ? 409 : code === '22023' ? 400 : code === 'P0002' ? 404 : 500;
    const message = code === '40001' ? 'Dữ liệu trận đã thay đổi, hãy tải lại.' : error?.message || 'Không lưu được tỉ số.';
    return NextResponse.json({ error: message, code: code || 'MUTATION_FAILED' }, { status });
}

function normalizeGames(games) {
    return games.map((game, index) => ({
        game_no: Number(game.game_no) || index + 1,
        kind: game.kind || 'game',
        score_a: Number(game.score_a) || 0,
        score_b: Number(game.score_b) || 0,
        lineup: game.lineup && typeof game.lineup === 'object' ? game.lineup : {},
    }));
}

async function handleGames(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;

        const body = await request.json();
        const matchId = body?.matchId;
        const games = Array.isArray(body?.games) ? body.games : [];
        if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });

        const { data: match, error: matchErr } = await db
            .from('tournament_matches')
            .select('*')
            .eq('id', matchId)
            .eq('group_id', groupId)
            .single();
        if (matchErr || !match) return NextResponse.json({ error: 'Match không tồn tại' }, { status: 404 });

        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('match_format, config')
            .eq('id', match.stage_id)
            .eq('group_id', groupId)
            .single();
        if (stageErr || !stage) return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });

        let engine;
        try {
            engine = getMatchEngine(stage.match_format);
        } catch (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        const normalizedGames = normalizeGames(games);
        let resolved;
        try {
            resolved = engine.resolveMatch(
                { entrant_a_id: match.entrant_a_id, entrant_b_id: match.entrant_b_id },
                normalizedGames,
                stage.config || {},
            );
        } catch (error) {
            console.error('Resolve match engine error:', error);
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        const advancement = resolved.complete
            ? advanceWinner({
                winner_entrant_id: resolved.winner_entrant_id,
                parent_match_id: match.parent_match_id,
                bracket_slot: match.bracket_slot,
            })
            : null;
        const idempotencyKey = String(
            body?.idempotency_key || body?.idempotencyKey || randomUUID(),
        ).trim();
        if (!idempotencyKey || idempotencyKey.length > 200) {
            return NextResponse.json({ error: 'idempotency_key không hợp lệ' }, { status: 400 });
        }
        const expectedVersion = body?.expected_version == null ? null : Number(body.expected_version);
        if (expectedVersion !== null && !Number.isInteger(expectedVersion)) {
            return NextResponse.json({ error: 'expected_version không hợp lệ' }, { status: 400 });
        }

        const { data, error } = await db.rpc('replace_tournament_games', {
            p_group_id: groupId,
            p_match_id: matchId,
            p_games: normalizedGames,
            p_winner_entrant_id: resolved.complete ? resolved.winner_entrant_id : null,
            p_status: resolved.complete ? 'done' : 'live',
            p_parent_field: advancement?.field || null,
            p_expected_version: expectedVersion,
            p_idempotency_key: idempotencyKey,
        });
        if (error) return rpcErrorResponse(error);

        return NextResponse.json(data || {
            success: true,
            complete: resolved.complete,
            winner_entrant_id: resolved.complete ? resolved.winner_entrant_id : null,
        });
    } catch (err) {
        console.error('Games v2 PUT error:', err);
        return rpcErrorResponse(err);
    }
}

export async function PUT(request) {
    return handleGames(request);
}

export async function POST(request) {
    return handleGames(request);
}
