import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { isFormatEnabled } from '@/lib/tournament/setupFormats';
import { normalizeDraft } from '@/lib/tournament/setupDraftV3';
import { messageFor } from '@/lib/tournament/setupMessages';
import { buildSetupPlan } from '@/lib/tournament/setupPlans';
import { firstBlocker, setupContext } from '@/lib/tournament/setupServer';
import { effectivePairs, entryClubs, finalizePlanPayload } from '@/lib/tournament/friendlySetup';
import { loadFriendlyContext, organizerModeMismatch, publishFriendlyTournament } from '@/lib/tournament/friendlyServer';
import { communitySetupAdmin, loadCommunitySetup } from '@/lib/communitySetupServer';

// Chốt giải luồng v3 (spec Lát A §10): route TÍNH LẠI plan từ bản nháp đã lưu (không tin
// plan do client gửi), so fingerprint với bản đã xem trước, rồi gọi RPC v4 ghi nguyên tử.
// Chốt xong: giải chuyển "Chờ diễn ra" (scheduled) và có sẵn Sân 01…N theo số sân đã nhập
// (migration 109). Không tự chuyển LIVE — trận đầu tiên được gọi vào sân mới chuyển.
// Giải giao hữu liên CLB (Epic 3 F2 §5): plan dựng trên cặp hiệu lực (chủ nhà + CLB khách đã duyệt, rải CLB);
// hạn mức CLB khách lấy từ friendlyEntitlements trên server (p_plan.friendly), không bao giờ từ body; migration 111
// kiểm lại mọi thứ dưới khoá. Chốt xong giải friendly đang riêng tư → tự bật link xem (D50, publicSlug dùng chung).

const db = supabaseAdmin || supabaseServer;

function validId(value) {
    return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

// Mã lấy từ message RAISE (khớp includes, mã đầu tiên thắng). Mã giao hữu (111) đều 409 — xung đột trạng thái.
const RPC_CODES = [
    'FRIENDLY_HOST_GUEST_NOT_ALLOWED', 'FRIENDLY_GUEST_NOT_ALLOWED', 'FRIENDLY_CLUB_NOT_READY', 'EXTERNAL_CLUB_NOT_SUPPORTED',
    'FRIENDLY_CLUB_LIMIT_REACHED', 'FRIENDLY_ROSTER_CHANGED', 'FRIENDLY_QUOTA_EXCEEDED', 'FRIENDLY_ATHLETE_DUPLICATE',
    'FRIENDLY_CLUBS_TOO_FEW',
    'COMMUNITY_MEMBER_PICK_NOT_ALLOWED', 'COMMUNITY_ROSTER_CHANGED', 'COMMUNITY_TOO_FEW_PAIRS',
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

// DETAIL JSON của RAISE (111: tên CLB chưa sẵn sàng, hạn mức, quota, VĐV trùng) → params của câu lỗi.
function rpcParams(error) {
    const details = error?.details;
    if (typeof details !== 'string' || !details.trim().startsWith('{')) return undefined;
    try {
        const value = JSON.parse(details);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
    } catch {
        return undefined;
    }
}

export async function POST(request) {
    let admin = await requireValidatedGroupAdmin();
    if (!admin.ok) {
        // Giải cộng đồng (Epic 4 C3, D62): admin hệ thống dùng platform_session; phiên CLB giữ nguyên.
        const preview = await request.clone().json().catch(() => null);
        admin = (await communitySetupAdmin(preview?.tournamentId ?? preview?.tournament_id)) || admin;
    }
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
        // null với giải nội bộ → mọi bước dưới đây y như trước Epic 3.
        const friendly = await loadFriendlyContext(db, { groupId: admin.groupId, tournamentId: Number(tournamentId), draft });
        if (organizerModeMismatch(draft, friendly)) return fail('ORGANIZER_MODE_LOCKED', 409);
        // null với giải CLB / giao hữu. Giải cộng đồng: cặp hiệu lực = đơn đã duyệt, tính lại trên server (D61).
        const community = await loadCommunitySetup({ groupId: admin.groupId, tournamentId: Number(tournamentId), divisionId: Number(divisionId) });
        const ctx = await setupContext(db, admin.groupId, draft, { friendly });
        if (community) ctx.community = community;
        const blocker = firstBlocker(draft, ctx, 4);
        if (blocker) return fail(blocker.code, 409, blocker.params);

        const pairs = community ? community.approvedPairs : effectivePairs(draft, friendly);
        let plan;
        try {
            plan = buildSetupPlan({
                formatKey: draft.format.formatKey,
                config: draft.format.config,
                pairIds: pairs.map((pair) => pair.pairId),
                seed: draft.draw.seed,
                divisionId: String(division.id),
                ...(friendly ? { entryClubs: entryClubs(pairs) } : {}),
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
            // Giải cộng đồng: pairs = cặp đã duyệt ({ pairId, participantRefs }) và friendly = null → p_plan.pairs = { pairId, refs } như giải khác.
            p_plan: finalizePlanPayload({ plan, pairs, friendly }),
        });
        if (error) {
            const code = RPC_CODES.find((candidate) => String(error.message || '').includes(candidate));
            console.error('Setup finalize RPC error:', error);
            return fail(code || 'FINALIZE_NOT_ATOMIC', error.code === 'P0002' ? 404 : 409, code ? rpcParams(error) : undefined);
        }

        // Bước phụ sau chốt: idempotent, lỗi ở đây KHÔNG làm hỏng giải đã chốt (lần mở sau vẫn gọi lại được).
        const prepared = await db.rpc('prepare_tournament_after_finalize', {
            p_group_id: Number(admin.groupId),
            p_tournament_id: Number(tournamentId),
        });
        if (prepared.error) console.error('Prepare after finalize error:', prepared.error);

        // D50: giải giao hữu đang riêng tư → "chỉ ai có link" + slug. Lỗi chỉ log (giải đã chốt; bật tay ở Cài đặt).
        let publicUrl = null;
        if (friendly) {
            try {
                publicUrl = await publishFriendlyTournament(db, { groupId: admin.groupId, tournamentId: Number(tournamentId) });
            } catch (publishError) {
                console.error('Publish friendly tournament error:', publishError);
            }
        }

        return NextResponse.json({
            success: true,
            ...(data || {}),
            prepared: prepared.error ? null : prepared.data,
            tournamentId: Number(tournamentId),
            divisionId: Number(divisionId),
            revision: Number(data?.setup_revision || expectedRevision + 1),
            ...(friendly ? { publicUrl } : {}),
            redirect: `/dieu-hanh-giai/${tournamentId}?step=control`,
        });
    } catch (error) {
        console.error('Setup finalize error:', error);
        return fail(error.code || 'FINALIZE_NOT_ATOMIC', error.status || 500);
    }
}
