import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { isFormatEnabled } from '@/lib/tournament/setupFormats';

const db = supabaseAdmin || supabaseServer;

function finalizeError(code, message, status = 400) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function validId(value) {
    return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

function mapRpcError(error) {
    const message = error?.message || 'Không thể chốt bốc thăm';
    const code = [
        'SETUP_REVISION_CONFLICT', 'ROSTER_LOCKED', 'DRAW_FINGERPRINT_MISMATCH', 'FINALIZE_DRAFT_INVALID',
        'FINALIZE_STRUCTURE_ALREADY_EXISTS', 'IDEMPOTENCY_KEY_REUSED',
        'TOURNAMENT_ATHLETE_CLUB_SCOPE_MISMATCH',
    ].find((candidate) => message.includes(candidate)) || 'FINALIZE_NOT_ATOMIC';
    return finalizeError(code, message, error?.code === 'P0002' ? 404 : 409);
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
        const previewFingerprint = String(body?.previewFingerprint ?? body?.preview_fingerprint ?? '').trim();
        if (!validId(tournamentId) || !validId(divisionId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1
            || !idempotencyKey || idempotencyKey.length > 200 || !/^[a-f0-9]{64}$/i.test(previewFingerprint)) {
            throw finalizeError('SETUP_PAYLOAD_INVALID', 'Thông tin chốt bốc thăm không hợp lệ.');
        }
        // Registry thể thức (ADR-005 D5): chặn trước khi chạm RPC ghi.
        const { data: division, error: divisionError } = await db.from('tournament_divisions')
            .select('setup_draft')
            .eq('id', Number(divisionId)).eq('tournament_id', Number(tournamentId)).eq('group_id', Number(admin.groupId))
            .maybeSingle();
        if (divisionError) throw finalizeError('FINALIZE_READ_FAILED', 'Không thể tải bản nháp thiết lập.', 500);
        if (!division) throw finalizeError('DIVISION_NOT_FOUND', 'Không tìm thấy nội dung trong giải đấu.', 404);
        if (!isFormatEnabled(division.setup_draft?.format?.formatKey)) {
            throw finalizeError('FORMAT_NOT_AVAILABLE', 'Thể thức này sắp có. Hãy chọn thể thức khác.', 409);
        }
        const { data, error } = await db.rpc('finalize_internal_doubles_group_knockout_v3', {
            p_group_id: Number(admin.groupId),
            p_tournament_id: Number(tournamentId),
            p_division_id: Number(divisionId),
            p_expected_setup_revision: expectedRevision,
            p_idempotency_key: idempotencyKey,
            p_preview_fingerprint: previewFingerprint.toLowerCase(),
        });
        if (error) throw mapRpcError(error);

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
        return NextResponse.json({
            error: error.message || 'Không thể chốt bốc thăm',
            code: error.code || 'FINALIZE_NOT_ATOMIC',
        }, { status: error.status || 409 });
    }
}
