import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { mapRpcError, validateFinalizePayload } from '@/lib/tournament/setupFinalize';

const db = supabaseAdmin || supabaseServer;

// The legacy draw RPC is intentionally used only for the final stage checkpoint.
// It writes stage entrants and fixtures in one database transaction;
// the existing stage-entrant table remains the only slot persistence path.
export async function POST(request) {
    const admin = await requireValidatedGroupAdmin();
    if (!admin.ok) return admin.response;
    try {
        const body = await request.json();
        const { tournamentId, divisionId, expectedRevision, idempotencyKey } = validateFinalizePayload(body);
        const stages = Array.isArray(body.stage_plan) ? body.stage_plan : body.stagePlan;
        const draw = body.draw;
        const normalizedStages = stages.map((stage) => ({
            stage_id: Number(stage?.stage_id ?? stage?.stageId),
            expected_config: stage.expected_config ?? stage.expectedConfig,
            matches: stage.matches || [],
        }));
        if (normalizedStages.some((stage) => !Number.isSafeInteger(stage.stage_id) || stage.stage_id < 1)) {
            const error = new Error('stage_id không hợp lệ');
            error.code = 'STAGE_PLAN_INVALID';
            throw error;
        }
        const { data, error } = await db.rpc('finalize_unified_setup_v2', {
            p_group_id: Number(admin.groupId),
            p_tournament_id: tournamentId,
            p_division_id: divisionId,
            p_expected_revision: expectedRevision,
            p_stage_plan: normalizedStages,
            p_idempotency_key: idempotencyKey,
        });
        if (error) throw mapRpcError(error);

        return NextResponse.json({
            success: true,
            tournamentId,
            divisionId,
            revision: expectedRevision + 1,
            redirect: `/giai-dau/${tournamentId}/lich-thi-dau`,
            stages: data?.stages || [],
            draw: { ...draw, status: 'locked' },
        });
    } catch (error) {
        console.error('Setup finalize error:', error);
        return NextResponse.json({
            error: { code: error.code || 'FINALIZE_NOT_ATOMIC', message: error.message },
        }, { status: error.status || (error.code === 'STAGE_PLAN_INVALID' ? 400 : 409) });
    }
}
