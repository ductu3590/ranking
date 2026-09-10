import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { getMatchEngine } from '@/lib/tournament/engines';
import { advanceWinner } from '@/lib/tournament/results';
import { validateGameScore } from '@/lib/tournament/rules/scoring';
import { resolveMatchScoring } from '@/lib/tournament/rules/roundScoring';

import { hashScorekeeperToken, validateScorekeeperToken } from '@/lib/tournament/scorekeeperToken';

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
        const body = await request.json();
        const matchId = body?.matchId;
        const games = Array.isArray(body?.games) ? body.games : [];
        if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });

        const adminCheck = await requireValidatedGroupAdmin();
        let groupId;
        let scorekeeperToken = null;
        if (adminCheck.ok) {
            groupId = adminCheck.groupId;
        } else if (body?.scorekeeper_token) {
            const { data: tokenRecord, error: tokenError } = await db.from('tournament_scorekeeper_tokens')
                .select('id, group_id, match_id, token_hash, expires_at, revoked_at, last_used_at')
                .eq('token_hash', hashScorekeeperToken(body.scorekeeper_token)).maybeSingle();
            if (tokenError) return NextResponse.json({ error: 'Scorekeeper token không hợp lệ', code: 'TOKEN_INVALID' }, { status: 401 });
            const tokenCheck = validateScorekeeperToken(body.scorekeeper_token, tokenRecord, Date.now());
            if (!tokenCheck.ok || Number(tokenRecord.match_id) !== Number(matchId)) return NextResponse.json({ error: 'Scorekeeper token không hợp lệ', code: tokenCheck.code || 'TOKEN_SCOPE_INVALID' }, { status: 401 });
            groupId = tokenRecord.group_id;
            scorekeeperToken = tokenRecord;
        } else {
            return adminCheck.response;
        }

        const { data: match, error: matchErr } = await db
            .from('tournament_matches')
            .select('*')
            .eq('id', matchId)
            .eq('group_id', groupId)
            .single();
        if (matchErr || !match) return NextResponse.json({ error: 'Match không tồn tại' }, { status: 404 });

        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('id, tournament_id, division_id, schedule_format, match_format, config')
            .eq('id', match.stage_id)
            .eq('group_id', groupId)
            .single();
        if (stageErr || !stage) return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });

        // Luật đem ra kiểm là luật của VÒNG chứa trận này, không phải luật chung
        // của giải. Cần cả tournament và division để resolve đủ 4 tầng.
        const [tournamentResult, divisionResult] = await Promise.all([
            db.from('tournaments')
                .select('id, default_scoring, tiebreak_policy')
                .eq('id', stage.tournament_id).eq('group_id', groupId).maybeSingle(),
            stage.division_id
                ? db.from('tournament_divisions')
                    .select('id, scoring_override, tiebreak_override')
                    .eq('id', stage.division_id).eq('group_id', groupId).maybeSingle()
                : Promise.resolve({ data: null, error: null }),
        ]);
        if (tournamentResult.error || divisionResult.error) {
            return NextResponse.json({
                error: (tournamentResult.error || divisionResult.error).message,
            }, { status: 500 });
        }
        const scoring = resolveMatchScoring(
            tournamentResult.data || {},
            divisionResult.data || {},
            stage,
            match,
        );

        let engine;
        try {
            engine = getMatchEngine(stage.match_format);
        } catch (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        const normalizedGames = normalizeGames(games);
        // Luôn kiểm. Trước đây bọc trong if(scoring) nên giai đoạn chưa từng qua
        // generate thì không có config.scoring và mọi tỉ số đều lọt.
        for (let index = 0; index < normalizedGames.length; index += 1) {
            const validation = validateGameScore(normalizedGames[index], scoring, index);
            if (!validation.ok) {
                return NextResponse.json({
                    error: `Tỉ số ván ${index + 1} không hợp lệ với luật của ${scoring.round_key === 'GF' ? 'chung kết tổng' : `vòng ${scoring.round_key}`} (tới ${scoring.points_to}, cách ${scoring.win_by}${scoring.cap ? `, cap ${scoring.cap}` : ''}).`,
                    code: validation.code,
                }, { status: 400 });
            }
        }

        let resolved;
        try {
            // Giải theo division chỉ có entry_*_id; engine nói ngôn ngữ entrant_*_id.
            // Không quy đổi ở đây thì engine nhận null và không bao giờ ra người thắng.
            resolved = engine.resolveMatch(
                {
                    entrant_a_id: match.entrant_a_id ?? match.entry_a_id ?? null,
                    entrant_b_id: match.entrant_b_id ?? match.entry_b_id ?? null,
                },
                normalizedGames,
                { ...(stage.config || {}), ...scoring.engine },
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
            // 'finalized' chứ không phải 'done': constraint
            // tournament_matches_status_phase3_ck chỉ nhận pending|live|finalized.
            // Các engine dùng 'done' làm từ vựng nội bộ và có tầng dịch riêng ở
            // standingsService — không đụng vào đó.
            p_status: resolved.complete ? 'finalized' : 'live',
            p_parent_field: advancement?.field || null,
            p_expected_version: expectedVersion,
            p_idempotency_key: idempotencyKey,
        });
        if (error) return rpcErrorResponse(error);

        if (scorekeeperToken) {
            // Chỉ ghi dấu để audit. Tỉ số đã lưu xong ở trên nên lỗi ở bước này
            // không được làm hỏng phản hồi, nếu không client sẽ tưởng thất bại
            // và gửi lại một thao tác đã thành công.
            const { error: usageError } = await db.from('tournament_scorekeeper_tokens')
                .update({ last_used_at: new Date().toISOString() }).eq('id', scorekeeperToken.id);
            if (usageError) console.error('Scorekeeper token usage stamp failed:', usageError);
        }

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
