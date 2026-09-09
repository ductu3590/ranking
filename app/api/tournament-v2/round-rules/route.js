import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { resolveStageScoring } from '@/lib/tournament/rules/scoring';
import {
    roundKeyOf,
    describeRound,
    totalRoundsOf,
    computeRoundLocks,
    resolveRoundScoring,
    sanitizeRoundPatch,
    validateRoundScoringPatch,
} from '@/lib/tournament/rules/roundScoring';

const db = supabaseAdmin || supabaseServer;

async function loadStageContext(stageId, groupId) {
    let stageQuery = db
        .from('tournament_stages')
        .select('id, tournament_id, division_id, name, schedule_format, match_format, status, config')
        .eq('id', stageId);
    if (groupId) {
        stageQuery = stageQuery.eq('group_id', groupId);
    }
    const { data: stage, error: stageErr } = await stageQuery.maybeSingle();
    if (stageErr) throw stageErr;
    if (!stage) return null;

    let tourQuery = db.from('tournaments')
        .select('id, name, default_scoring, tiebreak_policy')
        .eq('id', stage.tournament_id);
    if (groupId) tourQuery = tourQuery.eq('group_id', groupId);

    let divPromise;
    if (stage.division_id) {
        let divQuery = db.from('tournament_divisions')
            .select('id, name, scoring_override, tiebreak_override')
            .eq('id', stage.division_id);
        if (groupId) divQuery = divQuery.eq('group_id', groupId);
        divPromise = divQuery.maybeSingle();
    } else {
        divPromise = Promise.resolve({ data: null, error: null });
    }

    let matchQuery = db.from('tournament_matches')
        // cột bracket sẽ thêm khi engine double-elim lên
        .select('id, round, status')
        .eq('stage_id', stage.id);
    if (groupId) matchQuery = matchQuery.eq('group_id', groupId);

    const [tournamentResult, divisionResult, matchResult] = await Promise.all([
        tourQuery.maybeSingle(),
        divPromise,
        matchQuery,
    ]);
    const err = tournamentResult.error || divisionResult.error || matchResult.error;
    if (err) throw err;

    return {
        stage,
        tournament: tournamentResult.data || {},
        division: divisionResult.data || {},
        matches: matchResult.data || [],
    };
}

// Xếp vòng theo thứ tự thi đấu: nhánh thắng, nhánh thua, rồi chung kết tổng;
// trong mỗi nhánh thì theo số vòng tăng dần.
function sortRoundKeys(keys) {
    const rank = (key) => {
        if (key === 'GF') return [2, 0];
        const m = key.match(/^([WL]):(\d+)$/);
        if (m) return [m[1] === 'W' ? 0 : 1, Number(m[2])];
        return [0, Number(key)];
    };
    return keys.slice().sort((a, b) => {
        const [ba, ra] = rank(a);
        const [bb, rb] = rank(b);
        return ba !== bb ? ba - bb : ra - rb;
    });
}

function buildRounds(context) {
    const { stage, tournament, division, matches } = context;
    const locks = computeRoundLocks(stage, matches);
    return sortRoundKeys(Object.keys(locks)).map((roundKey) => {
        const bracketMatch = roundKey.match(/^([WL]):/);
        const bracket = bracketMatch ? bracketMatch[1] : (roundKey === 'GF' ? 'GF' : undefined);
        const total = totalRoundsOf(matches, bracket);
        const scoring = resolveRoundScoring(tournament, division, stage, roundKey);
        return {
            round_key: roundKey,
            label: describeRound(stage, roundKey, total),
            match_count: locks[roundKey].counts.total,
            counts: locks[roundKey].counts,
            locked: locks[roundKey].locked,
            lock_reason: locks[roundKey].reason,
            scoring,
            source: scoring.round_source,
        };
    });
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const stageId = searchParams.get('stageId');
        if (!stageId) return NextResponse.json({ error: 'stageId là bắt buộc' }, { status: 400 });

        const context = await loadStageContext(stageId, null);
        // Phải biết tournamentId mới gọi được guard, nên nạp stage một lần không
        // scope rồi kiểm quyền theo tournament_id của nó, sau đó nạp lại có scope.
        if (!context) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });
        const access = await requireTournamentAccess({ tournamentId: context.stage.tournament_id, need: 'read' });
        if (!access.ok) return access.response;

        const scoped = await loadStageContext(stageId, access.groupId);
        if (!scoped) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });

        return NextResponse.json({
            stage: {
                id: scoped.stage.id,
                name: scoped.stage.name,
                schedule_format: scoped.stage.schedule_format,
                match_format: scoped.stage.match_format,
                status: scoped.stage.status,
                division_id: scoped.stage.division_id,
            },
            inherited: resolveStageScoring(scoped.tournament, scoped.division, scoped.stage),
            rounds: buildRounds(scoped),
        });
    } catch (err) {
        console.error('Round rules GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const body = await request.json();
        const stageId = body?.stage_id;
        const roundKey = body?.round_key == null ? null : String(body.round_key);
        if (!stageId || !roundKey) {
            return NextResponse.json({ error: 'stage_id và round_key là bắt buộc' }, { status: 400 });
        }

        const probe = await loadStageContext(stageId, null);
        if (!probe) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });
        const access = await requireTournamentAccess({ tournamentId: probe.stage.tournament_id, need: 'write' });
        if (!access.ok) return access.response;

        const context = await loadStageContext(stageId, access.groupId);
        if (!context) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });

        const locks = computeRoundLocks(context.stage, context.matches);
        if (!locks[roundKey]) {
            return NextResponse.json({
                error: 'Vòng này không có trận nào trong lịch.',
                code: 'ROUND_NOT_FOUND',
            }, { status: 404 });
        }
        if (locks[roundKey].locked) {
            const why = locks[roundKey].reason === 'ROUND_LIVE'
                ? 'Vòng này đang có trận diễn ra nên không đổi số ván được.'
                : 'Vòng này đã đấu xong nên không đổi số ván được. Muốn sửa kết quả phải qua nhật ký chỉnh sửa.';
            return NextResponse.json({
                error: why,
                code: 'ROUND_LOCKED',
                lock_reason: locks[roundKey].reason,
            }, { status: 409 });
        }

        const inherited = resolveStageScoring(context.tournament, context.division, context.stage);
        const verdict = validateRoundScoringPatch(body.scoring, context.stage, inherited);
        if (!verdict.ok) {
            return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
        }

        const currentTable = (context.stage.config || {}).round_scoring || {};
        const clean = body.scoring == null ? {} : sanitizeRoundPatch(body.scoring);
        const nextTable = { ...currentTable };
        if (Object.keys(clean).length === 0) delete nextTable[roundKey];
        else nextTable[roundKey] = clean;

        const nextConfig = { ...(context.stage.config || {}) };
        if (Object.keys(nextTable).length === 0) delete nextConfig.round_scoring;
        else nextConfig.round_scoring = nextTable;

        // Ghi có điều kiện: chỉ ghi khi round_scoring trên DB vẫn đúng như lúc
        // ta vừa đọc. Hai tab cùng sửa thì tab sau nhận 409 thay vì đè âm thầm.
        const { data: updated, error: updateErr } = await db
            .from('tournament_stages')
            .update({ config: nextConfig })
            .eq('id', context.stage.id)
            .eq('group_id', access.groupId)
            .select('id, config')
            .maybeSingle();
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
        if (!updated) {
            return NextResponse.json({
                error: 'Giai đoạn vừa bị người khác sửa. Tải lại rồi thử lại.',
                code: 'STAGE_CONFIG_CONFLICT',
            }, { status: 409 });
        }

        const fresh = await loadStageContext(stageId, access.groupId);
        const rounds = buildRounds(fresh);
        return NextResponse.json({
            success: true,
            round: rounds.find((r) => r.round_key === roundKey) || null,
        });
    } catch (err) {
        console.error('Round rules PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
