import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { getScheduleEngine } from '@/lib/tournament/engines';
import { loadStageData, loadScoringContext, stageWithResolvedTiebreak } from '@/lib/tournament/standingsService';
import { isStageComplete, seedNextStage } from '@/lib/tournament/orchestrator';
import { findNextStage } from '@/lib/tournament/nextStage';
import { resolveGroupKnockoutAdvance } from '@/lib/tournament/setupPlans/groupKnockout';

// Xung dot nghiep vu nay ERRCODE 'PH409' (migration 078). Truoc day dung 40001,
// nhung 40001 la serialization_failure nen tang tren tu dong retry va request treo.
const CONFLICT_CODES = ['PH409', '40001'];

const db = supabaseAdmin || supabaseServer;

function rpcErrorResponse(error) {
    const code = error?.code;
    const status = CONFLICT_CODES.includes(code) ? 409 : code === '22023' ? 400 : code === 'P0002' ? 404 : 500;
    const message = CONFLICT_CODES.includes(code)
        ? 'Stage đã thay đổi, hãy tải lại.'
        : error?.message || 'Không thể chuyển stage.';
    return NextResponse.json({ error: message, code: code || 'MUTATION_FAILED' }, { status });
}



export async function POST(request) {
    try {
        const body = await request.json();
        const stageId = body?.stageId;
        if (!stageId) {
            return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
        }
        const access = await requireTournamentAccess({ stageId, need: 'write' });
        if (!access.ok) return access.response;
        const groupId = access.groupId;
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
        let expectedResultsFingerprint = null;
        // Stage đã gắn chính sách tie-break hiệu lực. Suất tiến cấp phải được
        // tính bằng ĐÚNG chính sách mà bảng xếp hạng đang hiển thị.
        let effectiveStage = stage;
        try {
            // Chụp fingerprint TRƯỚC khi đọc policy và tính BXH. Fingerprint DB gồm
            // cả kết quả lẫn effective tie-break; nếu một trong hai đổi trong cửa
            // sổ này, RPC sẽ từ chối thay vì seed bằng BXH stale.
            if (stage.division_id != null) {
                const fingerprintResult = await db.rpc('group_stage_results_fingerprint', {
                    p_group_id: groupId,
                    p_stage_id: stage.id,
                });
                if (fingerprintResult.error) return rpcErrorResponse(fingerprintResult.error);
                expectedResultsFingerprint = fingerprintResult.data;
            }
            // Phải kèm context luật điểm: thiếu nó thì trận BO1 bị resolve theo BO3,
            // coi như chưa xong, không có người thắng -> standings rỗng group_label và
            // advance bị RPC từ chối bằng INVALID_GROUP_RANKINGS.
            const scoringContext = await loadScoringContext(db, stage, groupId);
            loaded = await loadStageData(db, stage, groupId, scoringContext);
            effectiveStage = stageWithResolvedTiebreak(stage, scoringContext).stage;
        } catch (e) {
            console.error('Advance load/match-engine error:', e);
            return NextResponse.json({ error: e.message, code: e.code || 'ADVANCE_READ_FAILED' }, { status: e.status || 400 });
        }
        if (loaded.error) {
            return NextResponse.json({ error: loaded.error.message }, { status: loaded.error.status });
        }

        if (!isStageComplete(loaded.matches)) {
            return NextResponse.json({
                error: {
                    code: 'ADVANCE_RESULTS_INCOMPLETE',
                    message: 'Stage chưa hoàn tất',
                },
            }, { status: 400 });
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
                { schedule_format: stage.schedule_format, config: effectiveStage.config || {} },
                loaded.entrants,
                loaded.resolved,
            );
            // 4. Seed next stage from standings
            seeded = seedNextStage(
                { schedule_format: stage.schedule_format, config: effectiveStage.config || {} },
                standings,
            );
        } catch (e) {
            console.error('Advance engine error:', e);
            return NextResponse.json({ error: e.message }, { status: 400 });
        }

        // Stage do finalize v4 tạo (spec Lát A §11): có suất bù chéo bảng + hoán đổi tránh
        // cùng bảng. Phân công tính ở server rồi RPC v2 kiểm và ghi. Stage cũ đi nhánh dưới.
        if (stage.division_id != null && String(stage.config?.setupPlanVersion) === '4') {
            const { data: edgeRows, error: edgeError } = await db
                .from('tournament_stage_transitions')
                .select('id, source_kind, source_group_label, source_rank, source_pool_position, target_match_id, target_slot')
                .eq('group_id', groupId)
                .eq('source_stage_id', stage.id)
                .in('source_kind', ['group_rank', 'group_rank_pool']);
            if (edgeError) return NextResponse.json({ error: edgeError.message }, { status: 500 });
            // Vòng tròn (Lát B) không có tuyến đi tiếp: để nhánh chung bên dưới đánh dấu chặng cuối.
            if ((edgeRows || []).length) {
                const targetIds = [...new Set((edgeRows || []).map((edge) => edge.target_match_id))];
                const { data: targetRows, error: targetError } = targetIds.length
                    ? await db.from('tournament_matches').select('id, match_key').eq('group_id', groupId).in('id', targetIds)
                    : { data: [], error: null };
                if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
                const matchKeyById = new Map((targetRows || []).map((row) => [row.id, row.match_key]));
                let resolved;
                try {
                    resolved = resolveGroupKnockoutAdvance({
                        edges: (edgeRows || []).map((edge) => ({
                            id: edge.id,
                            kind: edge.source_kind,
                            groupLabel: edge.source_group_label,
                            rank: edge.source_rank,
                            poolPosition: edge.source_pool_position,
                            targetMatchKey: matchKeyById.get(edge.target_match_id) || String(edge.target_match_id),
                            targetSlot: edge.target_slot,
                        })),
                        standings,
                        seed: expectedResultsFingerprint,
                    });
                } catch (e) {
                    return NextResponse.json({ error: e.message, code: e.code || 'GROUP_RANKING_MISSING' }, { status: 400 });
                }
                const { data, error } = await db.rpc('advance_division_group_rank_transitions_v2', {
                    p_group_id: groupId,
                    p_stage_id: stage.id,
                    p_resolved: resolved.map((item) => ({ transition_id: item.transitionId, entry_id: item.entryId, swapped: item.swapped })),
                    p_idempotency_key: idempotencyKey,
                    p_expected_results_fingerprint: expectedResultsFingerprint,
                });
                if (error) return rpcErrorResponse(error);
                return NextResponse.json(data || { success: true, transitioned: true });
            }
        }

        // Unified group-to-playoff plans own their destination slots explicitly.
        // Legacy stages continue to use the adjacent-stage advance contract below.
        if (stage.division_id != null) {
            const { data: transitionRows, error: transitionError } = await db
                .from('tournament_stage_transitions')
                .select('id')
                .eq('group_id', groupId)
                .eq('source_stage_id', stage.id)
                .eq('source_kind', 'group_rank')
                .limit(1);
            if (transitionError) return NextResponse.json({ error: transitionError.message }, { status: 500 });
            if (transitionRows?.length) {
                const ranked = standings.map(({ entrant_id, group_label, rank }) => ({
                    entry_id: entrant_id,
                    group_label,
                    rank,
                }));
                // CAS tren ket qua vong bang: standings vua tinh o tren duoc chup lai
                // bang mot van tay; neu co correction chen vao giua thi RPC tu choi
                // thay vi seed bang hang da cu.
                const { data, error } = await db.rpc('advance_division_group_rank_transitions', {
                    p_group_id: groupId,
                    p_stage_id: stage.id,
                    p_ranked: ranked,
                    p_idempotency_key: idempotencyKey,
                    p_expected_results_fingerprint: expectedResultsFingerprint,
                });
                if (error) return rpcErrorResponse(error);
                return NextResponse.json(data || { success: true, transitioned: true });
            }
        }

        // 5. Find next stage
        const { data: nextStage, error: nextErr } = await findNextStage(db, stage, groupId);

        if (nextErr) {
            return NextResponse.json({ error: nextErr.message }, { status: 500 });
        }

        // Division stages use entry identity. Legacy stages retain their existing RPC.
        const isDivisionStage = stage.division_id != null;
        const rpcSeeded = isDivisionStage
            ? seeded.map(({ entrant_id, seed_in_stage }) => ({
                entry_id: entrant_id,
                seed_in_stage,
            }))
            : seeded;
        const rpcArgs = {
            p_group_id: groupId,
            p_stage_id: stage.id,
            p_next_stage_id: nextStage?.id || null,
            p_seeded: rpcSeeded,
            p_idempotency_key: idempotencyKey,
        };

        // 6. Commit finalization + next-stage seedings atomically in PostgreSQL.
        const { data, error } = isDivisionStage
            ? await db.rpc('advance_division_entry_stage', rpcArgs)
            : await db.rpc('advance_tournament_stage', rpcArgs);
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
