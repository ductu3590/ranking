import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';
import { correctionImpact, buildCorrectionRow } from '@/lib/tournament/correction';
import { resolveMatchScoring } from '@/lib/tournament/rules/roundScoring';
import { validateGameScore } from '@/lib/tournament/rules/scoring';
import { getMatchEngine } from '@/lib/tournament/engines';

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
        if (!matchId || !games) {
            return NextResponse.json({ error: 'match_id và games là bắt buộc' }, { status: 400 });
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
                    error: `Tỉ số ván ${i + 1} không hợp lệ với luật của vòng ${scoring.round_key} (tới ${scoring.points_to}, cách ${scoring.win_by}${scoring.cap ? `, cap ${scoring.cap}` : ''}).`,
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
        const winnerChanged = String(resolved.winner_entrant_id ?? '') !== String(previousWinner ?? '');

        let downstreamMatch = null;
        if (match.parent_match_id) {
            const { data } = await db
                .from('tournament_matches')
                .select('id, status')
                .eq('id', match.parent_match_id)
                .eq('group_id', access.groupId)
                .maybeSingle();
            downstreamMatch = data || null;
        }
        const impact = correctionImpact(match, downstreamMatch, { winnerChanged });

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

        // Ghi lại ván: xoá rồi chèn, trong phạm vi đúng một trận.
        const { error: delErr } = await db
            .from('tournament_games')
            .delete()
            .eq('group_id', access.groupId)
            .eq('match_id', matchId);
        if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

        const { error: insErr } = await db.from('tournament_games').insert(
            normalized.map((g) => ({ ...g, group_id: access.groupId, match_id: Number(matchId) })),
        );
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

        const patch = { version: Number(match.version) + 1 };
        if (match.entry_a_id != null) patch.winner_entry_id = resolved.winner_entrant_id;
        else patch.winner_entrant_id = resolved.winner_entrant_id;

        const { data: updated, error: updErr } = await db
            .from('tournament_matches')
            .update(patch)
            .eq('id', matchId)
            .eq('group_id', access.groupId)
            .eq('version', match.version)
            .select()
            .maybeSingle();
        if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
        if (!updated) {
            return NextResponse.json({
                error: 'Trận này vừa được người khác cập nhật. Tải lại rồi thử lại.',
                code: 'MATCH_VERSION_CONFLICT',
            }, { status: 409 });
        }

        // Đội thắng đổi thì đội ở trận vòng sau phải đổi theo. Chỉ tới đây khi
        // trận sau còn `pending` — mọi trạng thái khác đã bị chặn ở trên.
        if (winnerChanged && downstreamMatch && match.parent_match_id) {
            const field = match.bracket_slot % 2 === 0 ? 'entry_a_id' : 'entry_b_id';
            const legacyField = match.bracket_slot % 2 === 0 ? 'entrant_a_id' : 'entrant_b_id';
            const target = match.entry_a_id != null ? field : legacyField;
            const { error: advErr } = await db
                .from('tournament_matches')
                .update({ [target]: resolved.winner_entrant_id })
                .eq('id', match.parent_match_id)
                .eq('group_id', access.groupId);
            if (advErr) console.error('Cập nhật trận vòng sau lỗi:', advErr.message);
        }

        const row = buildCorrectionRow({
            groupId: access.groupId,
            tournamentId: stage.tournament_id,
            divisionId: stage.division_id,
            matchId: Number(matchId),
            before: { games: oldGames || [], winner: previousWinner },
            after: { games: normalized, winner: resolved.winner_entrant_id },
            reason,
            actor: access.actor || 'admin',
        });
        const { error: corrErr } = await db.from('tournament_result_corrections').insert(row);
        if (corrErr) console.error('Ghi bản ghi correction lỗi:', corrErr.message);

        const logged = await writeOperationLog(db, {
            groupId: access.groupId,
            tournamentId: stage.tournament_id,
            divisionId: stage.division_id,
            actor: access.actor || 'admin',
            action: 'result_corrected',
            targetType: 'match',
            targetId: Number(matchId),
            before: { winner: previousWinner },
            after: { winner: resolved.winner_entrant_id },
            reason,
        });
        if (!logged.ok) console.error('Ghi nhật ký sửa kết quả lỗi:', logged.error);

        // Giải đã chốt mà sửa kết quả thì hạng chung cuộc không còn đúng nữa.
        let finalStandingsCleared = false;
        if (stage.division_id) {
            const { data: t } = await db
                .from('tournaments').select('status')
                .eq('id', stage.tournament_id).eq('group_id', access.groupId).maybeSingle();
            if (t && t.status === 'completed') {
                await db.from('tournament_divisions')
                    .update({ final_standings: null })
                    .eq('id', stage.division_id).eq('group_id', access.groupId);
                finalStandingsCleared = true;
            }
        }

        return NextResponse.json({
            success: true,
            winner_changed: winnerChanged,
            final_standings_cleared: finalStandingsCleared,
        });
    } catch (err) {
        console.error('Corrections POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
