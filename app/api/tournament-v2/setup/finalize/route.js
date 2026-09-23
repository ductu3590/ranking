import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { isFormatEnabled } from '@/lib/tournament/setupFormats';
import { normalizeDraft } from '@/lib/tournament/setupDraftV3';
import { messageFor } from '@/lib/tournament/setupMessages';
import { buildSetupPlan } from '@/lib/tournament/setupPlans';
import { firstBlocker, setupContext } from '@/lib/tournament/setupServer';

// Chốt giải luồng v3 (spec Lát A §10): route TÍNH LẠI plan từ bản nháp đã lưu (không tin
// plan do client gửi), so fingerprint với bản đã xem trước, rồi gọi RPC v4 ghi nguyên tử.
// Chốt xong chuyển tới lịch; không tự chuyển LIVE.

const db = supabaseAdmin || supabaseServer;

function validId(value) {
    return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

const RPC_CODES = [
    'SETUP_REVISION_CONFLICT', 'ROSTER_LOCKED', 'DRAW_FINGERPRINT_MISMATCH', 'FINALIZE_DRAFT_INVALID',
    'FINALIZE_PLAN_INVALID', 'FINALIZE_STRUCTURE_ALREADY_EXISTS', 'IDEMPOTENCY_KEY_REUSED', 'PAIRING_INVALID',
    'MEMBER_NOT_ACTIVE_IN_GROUP', 'ATHLETE_IDENTITY_MISSING', 'GUEST_INVALID', 'FORMAT_NOT_AVAILABLE',
    'TOURNAMENT_ATHLETE_CLUB_SCOPE_MISMATCH', 'DIVISION_NOT_FOUND', 'TOURNAMENT_NOT_FOUND',
];

const FRIENDLY = {
    DRAW_FINGERPRINT_MISMATCH: 'Kết quả bốc thăm đã thay đổi. Tải lại rồi xem trước trước khi chốt.',
    FINALIZE_STRUCTURE_ALREADY_EXISTS: 'Giải này đã được chốt trước đó.',
    ROSTER_LOCKED: 'Giải này đã được chốt trước đó.',
    MEMBER_NOT_ACTIVE_IN_GROUP: 'Có người không còn hoạt động trong CLB. Quay lại Bước 2 để sửa.',
    ATHLETE_IDENTITY_MISSING: 'Có thành viên chưa có hồ sơ thi đấu. Quay lại Bước 2 để sửa.',
    PAIRING_INVALID: 'Danh sách cặp không hợp lệ. Quay lại Bước 3 để kiểm tra.',
    GUEST_INVALID: 'Có khách mời chưa hợp lệ. Quay lại Bước 2 để sửa.',
};

function fail(code, status = 409, params) {
    const known = messageFor(code, params);
    const text = FRIENDLY[code] || (known.step !== null || known.text !== 'Có lỗi xảy ra. Thử lại sau.' ? known.text : 'Không thể chốt giải. Không có dữ liệu nào bị ghi dở; thử lại sau.');
    return NextResponse.json({ error: text, code, step: known.step, ...(params ? { params } : {}) }, { status });
}

export async function POST(request) {
    const admin = await requireValidatedGroupAdmin();
    if (!admin.ok) return admin.response;
    try {
        const body = await request.json();
        const tournamentId = body?.tournamentId ?? body?.tournament_id;
        const divisionId = body?.divisionId ?? body?.division_id;
        const expectedRevision = Number(body?.expectedRevision ?? body?.expected_revision);
        const idempotencyKey = String(body?.idempotencyKey ?? body?.idempotency_key ?? '').trim();
        const previewFingerprint = String(body?.previewFingerprint ?? body?.preview_fingerprint ?? '').trim().toLowerCase();
        if (!validId(tournamentId) || !validId(divisionId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1
            || !idempotencyKey || idempotencyKey.length > 200 || !/^[a-f0-9]{64}$/.test(previewFingerprint)) {
            return fail('SETUP_PAYLOAD_INVALID', 400);
        }

        const { data: division, error: divisionError } = await db.from('tournament_divisions')
            .select('id, setup_revision, setup_draft')
            .eq('id', Number(divisionId)).eq('tournament_id', Number(tournamentId)).eq('group_id', Number(admin.groupId))
            .maybeSingle();
        if (divisionError) return fail('FINALIZE_READ_FAILED', 500);
        if (!division) return fail('DIVISION_NOT_FOUND', 404);
        if (Number(division.setup_revision) !== expectedRevision) return fail('SETUP_REVISION_CONFLICT', 409);

        const draft = normalizeDraft(division.setup_draft);
        if (!isFormatEnabled(draft.format.formatKey)) return fail('FORMAT_NOT_AVAILABLE', 409);
        const ctx = await setupContext(db, admin.groupId, draft);
        const blocker = firstBlocker(draft, ctx, 4);
        if (blocker) return fail(blocker.code, 409, blocker.params);

        let plan;
        try {
            plan = buildSetupPlan({
                formatKey: draft.format.formatKey,
                config: draft.format.config,
                pairIds: draft.pairs.map((pair) => pair.pairId),
                seed: draft.draw.seed,
                divisionId: String(division.id),
            });
        } catch (planError) {
            return fail(planError.code || 'DRAW_STALE', 409, planError.params);
        }
        if (plan.fingerprint !== draft.draw.previewFingerprint || plan.fingerprint !== previewFingerprint) {
            return fail('DRAW_STALE', 409);
        }

        const { data, error } = await db.rpc('finalize_internal_setup_v4', {
            p_group_id: Number(admin.groupId),
            p_tournament_id: Number(tournamentId),
            p_division_id: Number(divisionId),
            p_expected_setup_revision: expectedRevision,
            p_idempotency_key: idempotencyKey,
            p_preview_fingerprint: previewFingerprint,
            p_plan: {
                ...plan,
                pairs: draft.pairs.map((pair) => ({ pairId: pair.pairId, refs: pair.participantRefs })),
            },
        });
        if (error) {
            const code = RPC_CODES.find((candidate) => String(error.message || '').includes(candidate));
            console.error('Setup finalize RPC error:', error);
            return fail(code || 'FINALIZE_NOT_ATOMIC', error.code === 'P0002' ? 404 : 409);
        }

        return NextResponse.json({
            success: true,
            ...(data || {}),
            tournamentId: Number(tournamentId),
            divisionId: Number(divisionId),
            revision: Number(data?.setup_revision || expectedRevision + 1),
            redirect: `/dieu-hanh-giai/${tournamentId}?step=schedule`,
        });
    } catch (error) {
        console.error('Setup finalize error:', error);
        return fail(error.code || 'FINALIZE_NOT_ATOMIC', error.status || 500);
    }
}
