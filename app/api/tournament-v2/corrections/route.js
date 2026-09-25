import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';
import { correctionImpact } from '@/lib/tournament/correction';
import { resolveMatchScoring } from '@/lib/tournament/rules/roundScoring';
import { validateGameScore } from '@/lib/tournament/rules/scoring';
import { getMatchEngine } from '@/lib/tournament/engines';
import { actorName } from '@/lib/tournament/actorName';
import { classifyRpcConflict } from '@/lib/tournament/scoreEntry';

// Xung dot nghiep vu nay ERRCODE 'PH409' (migration 078). Truoc day dung 40001,
// nhung 40001 la serialization_failure nen tang tren tu dong retry va request treo.
const CONFLICT_CODES = ['PH409', '40001'];
// 55P03 = lock_not_available (het lock_timeout, migration 081), 57014 = statement
// timeout. Ca hai o day deu nghia la co thao tac tien cap/seed dang chay tren cung
// giai doan, khong phai loi may chu -> tra 409 kem huong dan, khong phai 500.
const LOCK_BUSY_CODES = ['55P03', '57014'];

const db = supabaseAdmin || supabaseServer;

async function loadContext(matchId) {
    const { data: match, error: matchErr } = await db
        .from('tournament_matches')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();
    if (matchErr) throw matchErr;
    if (!match) return null;

    const { data: stage, error: stageErr } = await db
        .from('tournament_stages')
        .select('id, tournament_id, division_id, schedule_format, match_format, config')
        .eq('id', match.stage_id)
        .maybeSingle();
    if (stageErr) throw stageErr;
    if (!stage) return null;

    return { match, stage };
}

async function loadRules(stage, groupId) {
    const [t, d] = await Promise.all([
        db.from('tournaments').select('id, default_scoring, tiebreak_policy')
            .eq('id', stage.tournament_id).eq('group_id', groupId).maybeSingle(),
        stage.division_id
            ? db.from('tournament_divisions').select('id, scoring_override, tiebreak_override')
                .eq('id', stage.division_id).eq('group_id', groupId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
    ]);
    if (t.error || d.error) throw (t.error || d.error);
    return { tournament: t.data || {}, division: d.data || {} };
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const matchId = searchParams.get('matchId');
        const tournamentId = searchParams.get('tournamentId');
        if (!matchId && !tournamentId) {
            return NextResponse.json({ error: 'matchId hoặc tournamentId là bắt buộc' }, { status: 400 });
        }

        let scopeTournamentId = tournamentId;
        if (!scopeTournamentId) {
            const ctx = await loadContext(matchId);
            if (!ctx) return NextResponse.json({ error: 'Không tìm thấy trận' }, { status: 404 });
            scopeTournamentId = ctx.stage.tournament_id;
        }
        const access = await requireTournamentAccess({ tournamentId: scopeTournamentId, need: 'read' });
        if (!access.ok) return access.response;

        let query = db
            .from('tournament_result_corrections')
            .select('id, match_id, before_payload, after_payload, reason, requester, approver, status, applied_at')
            .eq('group_id', access.groupId)
            .eq('tournament_id', scopeTournamentId)
            .order('applied_at', { ascending: false });
        if (matchId) query = query.eq('match_id', matchId);

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ corrections: data || [] });
    } catch (err) {
        console.error('Corrections GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const matchId = body?.match_id;
        const games = Array.isArray(body?.games) ? body.games : null;
        const preview = body?.preview === true;
        const reason = String(body?.reason || '').trim();
        const expectedVersion = body?.expected_version == null ? null : Number(body.expected_version);
        const idempotencyKey = String(body?.idempotency_key || body?.idempotencyKey || '').trim();
        if (!matchId || !games) {
            return NextResponse.json({ error: 'match_id và games là bắt buộc' }, { status: 400 });
        }
        if (!preview && (!Number.isInteger(expectedVersion) || expectedVersion < 1 || !idempotencyKey || idempotencyKey.length > 200)) {
            return NextResponse.json({ error: 'expected_version và idempotency_key hợp lệ là bắt buộc', code: 'CORRECTION_PAYLOAD_INVALID' }, { status: 400 });
        }

        const ctx = await loadContext(matchId);
        if (!ctx) return NextResponse.json({ error: 'Không tìm thấy trận' }, { status: 404 });
        const { match, stage } = ctx;

        const access = await requireTournamentAccess({ tournamentId: stage.tournament_id, need: 'write' });
        if (!access.ok) return access.response;
        if (Number(match.group_id) !== Number(access.groupId)) {
            return NextResponse.json({ error: 'Không tìm thấy trận' }, { status: 404 });
        }

        if (match.status !== 'finalized') {
            return NextResponse.json({
                error: 'Chỉ sửa được trận đã chốt. Trận chưa chốt thì nhập điểm bình thường.',
                code: 'MATCH_NOT_FINALIZED',
            }, { status: 409 });
        }

        // Luật đem ra kiểm là luật của VÒNG chứa trận, kể cả khi vòng đã khoá —
        // khoá chỉ ngăn ĐỔI luật, không ngăn áp dụng luật đang có.
        const { tournament, division } = await loadRules(stage, access.groupId);
        const scoring = resolveMatchScoring(tournament, division, stage, match);

        const normalized = games.map((g, i) => ({
            game_no: Number(g.game_no) || i + 1,
            kind: g.kind || 'game',
            score_a: Number(g.score_a) || 0,
            score_b: Number(g.score_b) || 0,
            lineup: g.lineup && typeof g.lineup === 'object' ? g.lineup : {},
        }));
        for (let i = 0; i < normalized.length; i += 1) {
            const v = validateGameScore(normalized[i], scoring, i);
            if (!v.ok) {
                return NextResponse.json({
                    error: `Tỉ số ván ${i + 1} không hợp lệ: điểm phải là số không âm và hai bên không được bằng nhau.`,
                    code: v.code,
                }, { status: 400 });
            }
        }

        let engine;
        try {
            engine = getMatchEngine(stage.match_format);
        } catch (err) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        const resolved = engine.resolveMatch(
            { entrant_a_id: match.entry_a_id ?? match.entrant_a_id, entrant_b_id: match.entry_b_id ?? match.entrant_b_id },
            normalized,
            { ...(stage.config || {}), ...scoring.engine },
        );

        const previousWinner = match.winner_entry_id ?? match.winner_entrant_id ?? null;
        if (!preview && (!resolved.complete || resolved.winner_entrant_id == null)) {
            return NextResponse.json({
                error: 'Tỉ số sửa phải xác định được đội thắng của trận đã chốt.',
                code: 'MATCH_OUTCOME_UNRESOLVABLE',
            }, { status: 409 });
        }
        const winnerChanged = String(resolved.winner_entrant_id ?? '') !== String(previousWinner ?? '');

        const downstreamMatches = [];
        if (match.parent_match_id) {
            const { data } = await db
                .from('tournament_matches')
                .select('id, status')
                .eq('id', match.parent_match_id)
                .eq('group_id', access.groupId)
                .maybeSingle();
            if (data) downstreamMatches.push(data);
        }
        const { data: transitionRows, error: transitionErr } = await db
            .from('tournament_stage_transitions')
            .select('target_match_id')
            .eq('group_id', access.groupId)
            .eq('source_kind', 'match_outcome')
            .eq('source_match_id', match.id);
        if (transitionErr) return NextResponse.json({ error: transitionErr.message }, { status: 500 });
        const targetIds = (transitionRows || []).map((row) => row.target_match_id);
        let graphTargets = [];
        if (targetIds.length) {
            const { data, error } = await db.from('tournament_matches').select('id, status')
                .eq('group_id', access.groupId).in('id', targetIds);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            graphTargets = data || [];
        }
        for (const target of graphTargets) {
            if (target && !downstreamMatches.some((item) => Number(item.id) === Number(target.id))) downstreamMatches.push(target);
        }
        const impact = correctionImpact(match, downstreamMatches, { winnerChanged });

        const { data: oldGames } = await db
            .from('tournament_games')
            .select('game_no, kind, score_a, score_b, lineup')
            .eq('group_id', access.groupId)
            .eq('match_id', matchId)
            .order('game_no');

        if (preview) {
            return NextResponse.json({
                preview: true,
                winner_changed: winnerChanged,
                previous_winner: previousWinner,
                next_winner: resolved.winner_entrant_id,
                complete: resolved.complete,
                blocked: impact.blocked,
                block_reason: impact.message,
                downstream: impact.downstream,
                before: { games: oldGames || [] },
                after: { games: normalized },
                scoring: { round_key: scoring.round_key, best_of: scoring.best_of, points_to: scoring.points_to },
            });
        }

        if (!reason) {
            return NextResponse.json({
                error: 'Sửa kết quả đã chốt phải nhập lý do.',
                code: 'REASON_REQUIRED',
            }, { status: 400 });
        }
        if (impact.blocked) {
            return NextResponse.json({
                error: impact.message,
                code: impact.code,
                downstream: impact.downstream,
            }, { status: 409 });
        }

        const { data: mutation, error: mutationError } = await db.rpc('apply_tournament_result_correction_graph_aware', {
            p_group_id: access.groupId,
            p_match_id: Number(matchId),
            p_games: normalized,
            p_winner_entrant_id: resolved.winner_entrant_id,
            p_expected_version: expectedVersion,
            p_reason: reason,
            p_actor: actorName(access),
            p_idempotency_key: idempotencyKey,
        });
        if (mutationError) {
            // Spec E2 §1: xung đột nghiệp vụ (phiên bản, trận sau đã bắt đầu) → câu tiếng Việt theo message RPC.
            const conflict = classifyRpcConflict(mutationError);
            if (conflict) return NextResponse.json({ error: conflict.message, code: conflict.code }, { status: conflict.status });
            const busy = LOCK_BUSY_CODES.includes(mutationError.code);
            const status = busy || CONFLICT_CODES.includes(mutationError.code) ? 409 : mutationError.code === '22023' ? 400 : mutationError.code === 'P0002' ? 404 : 500;
            return NextResponse.json({
                error: busy
                    ? 'Dang có thao tác tiến cấp vòng bảng lên play-off. Hãy đợi thao tác đó xong rồi thử lại.'
                    : mutationError.message,
                code: busy ? 'GROUP_SEEDING_IN_PROGRESS' : (mutationError.code || 'CORRECTION_FAILED'),
            }, { status });
        }

        const logged = await writeOperationLog(db, {
            groupId: access.groupId,
            tournamentId: stage.tournament_id,
            divisionId: stage.division_id,
            actor: actorName(access),
            action: 'result_corrected',
            targetType: 'match',
            targetId: Number(matchId),
            before: { winner: previousWinner, games: (oldGames || []).map(({ game_no, score_a, score_b }) => ({ game_no, score_a, score_b })) },
            after: { winner: resolved.winner_entrant_id, games: normalized.map(({ game_no, score_a, score_b }) => ({ game_no, score_a, score_b })) },
            reason,
        });
        if (!logged.ok) console.error('Ghi nhật ký sửa kết quả lỗi:', logged.error);

        return NextResponse.json({
            ...(mutation || { success: true }),
            winner_changed: winnerChanged,
        });
    } catch (err) {
        console.error('Corrections POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
