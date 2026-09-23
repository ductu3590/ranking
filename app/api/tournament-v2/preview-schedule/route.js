import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { normalizeDraft, toSavePayload } from '@/lib/tournament/setupDraftV3';
import { isFormatEnabled } from '@/lib/tournament/setupFormats';
import { computeCompletedThrough } from '@/lib/tournament/setupStepRules';
import { computeSetupReadiness } from '@/lib/tournament/setupReadiness';
import { messageFor } from '@/lib/tournament/setupMessages';
import { buildSetupPlan } from '@/lib/tournament/setupPlans';
import { firstBlocker, setupContext } from '@/lib/tournament/setupServer';

// Bốc thăm / cập nhật xem trước cho luồng tạo giải v3 (spec Lát A §3, §12).
// - action 'draw'    : server sinh seed mới rồi dựng plan (bốc thăm hoặc bốc lại).
// - action 'preview' : dùng lại seed đã lưu (vd chỉ đổi tranh hạng ba / BO chung kết).
// Plan + fingerprint được LƯU vào bản nháp qua RPC lưu (CAS theo revision), để finalize
// có đúng một bản để so. Seed không bao giờ hiển thị trên UI.

const db = supabaseAdmin || supabaseServer;

function validId(value) {
    return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

function fail(code, status = 400, params, message) {
    const text = message || messageFor(code, params).text;
    return NextResponse.json({ error: text, code, ...(params ? { params } : {}) }, { status });
}

const CONFLICT_MARKERS = ['SETUP_REVISION_CONFLICT', 'IDEMPOTENCY_KEY_REUSED'];

export async function POST(request) {
    const admin = await requireValidatedGroupAdmin();
    if (!admin.ok) return admin.response;
    try {
        const body = await request.json();
        const tournamentId = body?.tournamentId ?? body?.tournament_id;
        const divisionId = body?.divisionId ?? body?.division_id;
        const expectedRevision = Number(body?.expectedRevision ?? body?.expected_revision);
        const idempotencyKey = String(body?.idempotencyKey ?? body?.idempotency_key ?? '').trim();
        const action = body?.action === 'preview' ? 'preview' : 'draw';
        if (!validId(tournamentId) || !validId(divisionId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1
            || !idempotencyKey || idempotencyKey.length > 200) {
            return fail('SETUP_PAYLOAD_INVALID');
        }

        const { data: division, error: divisionError } = await db.from('tournament_divisions')
            .select('id, tournament_id, setup_revision, setup_draft, roster_lock_status')
            .eq('id', Number(divisionId)).eq('tournament_id', Number(tournamentId)).eq('group_id', Number(admin.groupId))
            .maybeSingle();
        if (divisionError) return fail('PREVIEW_READ_FAILED', 500, null, 'Không thể tải bản nháp thiết lập.');
        if (!division) return fail('DIVISION_NOT_FOUND', 404, null, 'Không tìm thấy nội dung trong giải đấu.');
        if (Number(division.setup_revision) !== expectedRevision) return fail('SETUP_REVISION_CONFLICT', 409);
        if (division.roster_lock_status !== 'open') return fail('ROSTER_LOCKED', 409, null, 'Giải đã chốt; không thể bốc thăm lại.');

        const draft = normalizeDraft(division.setup_draft);
        if (!isFormatEnabled(draft.format.formatKey)) return fail('FORMAT_NOT_AVAILABLE', 409);
        const ctx = await setupContext(db, admin.groupId, draft);
        const blocker = firstBlocker(draft, ctx, 3);
        if (blocker) return fail(blocker.code, 409, blocker.params);

        const seed = action === 'draw' ? randomUUID() : draft.draw.seed;
        if (!seed) return fail('DRAW_REQUIRED', 409);
        let plan;
        try {
            plan = buildSetupPlan({
                formatKey: draft.format.formatKey,
                config: draft.format.config,
                pairIds: draft.pairs.map((pair) => pair.pairId),
                seed,
                divisionId: String(division.id),
            });
        } catch (planError) {
            return fail(planError.code || 'FORMAT_CONFIG_INVALID', 409, planError.params);
        }

        const next = {
            ...draft,
            currentStep: 4,
            draw: { status: 'draft', seed, previewFingerprint: plan.fingerprint, plan },
            invalidation: { reasonCodes: [], earliestStep: null },
        };
        const payload = toSavePayload(next, 4);
        payload.progress = { completedThrough: computeCompletedThrough(next, ctx) };
        const { data, error } = await db.rpc('save_unified_setup_aggregate_draft', {
            p_group_id: Number(admin.groupId),
            p_tournament_id: Number(tournamentId),
            p_division_id: Number(divisionId),
            p_client_draft_key: draft.clientDraftKey || `division_${division.id}`,
            p_draft: payload,
            p_expected_setup_revision: expectedRevision,
            p_idempotency_key: idempotencyKey,
        });
        if (error) {
            const code = CONFLICT_MARKERS.find((marker) => String(error.message || '').includes(marker));
            if (code) return fail(code, 409);
            console.error('Preview save error:', error);
            return fail('SETUP_SAVE_FAILED', 500);
        }
        const savedDraft = normalizeDraft(data?.draft || payload);
        return NextResponse.json({
            success: true,
            ...(data || {}),
            action,
            draft: savedDraft,
            readiness: computeSetupReadiness(savedDraft, ctx),
            fingerprint: plan.fingerprint,
        });
    } catch (error) {
        console.error('Preview schedule error:', error);
        return fail(error.code || 'PREVIEW_FAILED', error.status || 500, null, 'Không thể bốc thăm. Thử lại sau.');
    }
}
