import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import {
    buildInternalDoublesGroupKnockoutPlan,
    stableStringify,
} from '@/lib/tournament/internalDoublesGroupKnockoutPlan';
import { isFormatEnabled } from '@/lib/tournament/setupFormats';

const db = supabaseAdmin || supabaseServer;

function previewError(code, message, status = 400) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function validId(value) {
    return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

function normalizedIds(value, field) {
    if (!Array.isArray(value)) throw previewError('SETUP_DRAFT_INVALID', `${field} phải là mảng`);
    const ids = value.map((id) => String(id || '').trim());
    if (ids.some((id) => !id)) throw previewError('SETUP_DRAFT_INVALID', `${field} chứa ID không hợp lệ`);
    if (new Set(ids).size !== ids.length) throw previewError('SETUP_DRAFT_INVALID', `${field} không được trùng ID`);
    return ids;
}

function previewFingerprintSnapshot(draft) {
    // Keep this in lockstep with the browser aggregate save boundary. Server-only
    // metadata such as revision must not make a saved snapshot unverifiable.
    return {
        draftVersion: 2,
        currentStep: Number(draft?.currentStep || 1),
        tournament: {
            name: String(draft?.tournament?.name || '').trim(),
            displayName: String(draft?.tournament?.displayName || '').trim(),
            organizerMode: draft?.tournament?.organizerMode || 'internal',
            eventDate: String(draft?.tournament?.eventDate || ''),
            location: String(draft?.tournament?.location || '').trim(),
            description: String(draft?.tournament?.description || '').trim(),
            posterUrl: String(draft?.tournament?.posterUrl || '').trim(),
        },
        division: { name: String(draft?.division?.name || '').trim(), playType: draft?.division?.playType || draft?.format?.entrantType || 'doubles' },
        format: { entrantType: draft?.format?.entrantType, formatKey: draft?.format?.formatKey, config: draft?.format?.config || {} },
        participants: { memberIds: (draft?.participants?.memberIds || draft?.participants?.selectedMemberIds || []).map(String), guests: Array.isArray(draft?.participants?.guests) ? draft.participants.guests : [] },
        pairs: Array.isArray(draft?.pairs) ? draft.pairs : [],
        unpairedMemberIds: Array.isArray(draft?.unpairedMemberIds) ? draft.unpairedMemberIds.map(String) : [],
        invitedClubs: Array.isArray(draft?.invitedClubs) ? draft.invitedClubs : [],
        draw: draft?.draw || {},
    };
}

function draftFingerprint(draft) {
    return require('node:crypto').createHash('sha256').update(stableStringify(previewFingerprintSnapshot(draft))).digest('hex');
}

function serverDrawSeed({ groupId, tournamentId, divisionId, revision, rerollNonce = 0 }) {
    const digest = require('node:crypto').createHash('sha256')
        .update(`${groupId}:unified-draw:${tournamentId}:${divisionId}:${revision}:${rerollNonce}`)
        .digest('hex');
    return (parseInt(digest.slice(0, 8), 16) % 1000000) + 1;
}

function previewScheduleProjection(plan, draft) {
    const courtCount = Math.max(1, Number(draft?.format?.config?.courtCount || 1));
    const minutesPerMatch = Math.max(1, Number(draft?.format?.config?.minutesPerMatch || 30));
    const date = String(draft?.tournament?.eventDate || '').trim();
    const time = String(draft?.tournament?.startTime || '08:00').trim();
    const base = new Date(`${date || '1970-01-01'}T${time.length === 5 ? time : '08:00'}:00`);
    return plan.matches.map((match, index) => ({
        matchKey: match.matchKey,
        stagePlanKey: match.stagePlanKey,
        court: (index % courtCount) + 1,
        round: Math.floor(index / courtCount) + 1,
        projectedStart: Number.isNaN(base.getTime()) ? null : new Date(base.getTime() + Math.floor(index / courtCount) * minutesPerMatch * 60000).toISOString(),
    }));
}

function buildPairEntries(draft) {
    const activeMemberIds = normalizedIds(draft?.participants?.memberIds || draft?.participants?.selectedMemberIds, 'memberIds');
    const active = new Set(activeMemberIds);
    const unpairedMemberIds = normalizedIds(draft?.unpairedMemberIds || [], 'unpairedMemberIds');
    if (unpairedMemberIds.some((memberId) => !active.has(memberId))) {
        throw previewError('UNPAIRED_MEMBER_OUTSIDE_ACTIVE_ROSTER', 'VĐV chưa ghép cặp phải thuộc roster active');
    }
    if (unpairedMemberIds.length) {
        throw previewError('UNPAIRED_MEMBER', 'Không thể bốc thăm khi còn VĐV chưa ghép cặp');
    }

    if (!Array.isArray(draft?.pairs)) throw previewError('SETUP_DRAFT_INVALID', 'pairs phải là mảng');
    const pairedMemberIds = new Set();
    const pairIds = new Set();
    const entries = draft.pairs.map((pair) => {
        const pairId = String(pair?.pairId || '').trim();
        if (!pairId) throw previewError('PAIR_ID_REQUIRED', 'Mỗi cặp phải có pairId ổn định');
        if (pairIds.has(pairId)) throw previewError('DUPLICATE_PAIR_ID', 'pairId không được trùng');
        pairIds.add(pairId);
        const memberIds = normalizedIds(pair?.memberIds, 'pair.memberIds');
        if (memberIds.length !== 2 || memberIds.some((memberId) => !active.has(memberId) || pairedMemberIds.has(memberId))) {
            throw previewError('PAIR_MEMBER_COUNT_INVALID', 'Mỗi cặp phải có đúng hai VĐV active khác nhau');
        }
        memberIds.forEach((memberId) => pairedMemberIds.add(memberId));
        // pairId is a durable client identity in the saved draft and the only preview entry ID.
        return { entryId: pairId };
    });
    if (activeMemberIds.some((memberId) => !pairedMemberIds.has(memberId))) {
        throw previewError('UNPAIRED_MEMBER', 'Mỗi VĐV active phải thuộc đúng một cặp');
    }
    return entries;
}

function validateSupportedDraft(draft) {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
        throw previewError('SETUP_DRAFT_INVALID', 'Không có bản nháp setup hợp lệ');
    }
    // Registry thể thức (ADR-005 D5): thể thức chưa mở thì server từ chối, kể cả khi UI bị bỏ qua.
    if (!isFormatEnabled(draft?.format?.formatKey)) {
        throw previewError('FORMAT_NOT_AVAILABLE', 'Thể thức này sắp có. Hãy chọn thể thức khác.', 409);
    }
    if (draft?.tournament?.organizerMode !== 'internal') {
        throw previewError('UNSUPPORTED_ORGANIZER_MODE', 'Preview này chỉ hỗ trợ giải nội bộ');
    }
    if (draft?.format?.entrantType !== 'doubles' || draft?.format?.formatKey !== 'group_knockout') {
        throw previewError('UNSUPPORTED_PREVIEW_FORMAT', 'Preview này chỉ hỗ trợ đánh đôi vòng bảng + loại trực tiếp');
    }
    return buildPairEntries(draft);
}

function errorResponse(error) {
    return NextResponse.json({
        error: error.message || 'Không thể xem trước lịch',
        code: error.code || 'PREVIEW_INVALID',
    }, { status: error.status || 400 });
}

export async function POST(request) {
    const admin = await requireValidatedGroupAdmin();
    if (!admin.ok) return admin.response;
    try {
        const body = await request.json();
        const tournamentId = body?.tournamentId ?? body?.tournament_id;
        const divisionId = body?.divisionId ?? body?.division_id;
        const expectedRevision = Number(body?.expectedRevision ?? body?.expected_revision);
        const suppliedFingerprint = String(body?.draftFingerprint ?? body?.draft_fingerprint ?? '').trim();
        if (!validId(tournamentId) || !validId(divisionId)) {
            throw previewError('PREVIEW_TARGET_REQUIRED', 'tournamentId và divisionId hợp lệ là bắt buộc');
        }
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
            throw previewError('REVISION_CONFLICT', 'expectedRevision hợp lệ là bắt buộc', 409);
        }
        if (!/^[a-f0-9]{64}$/i.test(suppliedFingerprint)) {
            throw previewError('DRAFT_FINGERPRINT_REQUIRED', 'draftFingerprint SHA-256 là bắt buộc');
        }

        const [{ data: division, error: divisionError }, { data: tournament, error: tournamentError }] = await Promise.all([
            db.from('tournament_divisions')
                .select('id, tournament_id, setup_revision, setup_draft')
                .eq('id', Number(divisionId)).eq('tournament_id', Number(tournamentId)).eq('group_id', Number(admin.groupId)).maybeSingle(),
            db.from('tournaments')
                .select('id')
                .eq('id', Number(tournamentId)).eq('group_id', Number(admin.groupId)).maybeSingle(),
        ]);
        if (divisionError || tournamentError) {
            console.error('Preview schedule read error:', divisionError || tournamentError);
            throw previewError('PREVIEW_READ_FAILED', 'Không thể tải bản nháp setup', 500);
        }
        if (!division || !tournament) throw previewError('PREVIEW_TARGET_NOT_FOUND', 'Không tìm thấy giải đấu hoặc nội dung', 404);
        if (Number(division.setup_revision) !== expectedRevision) {
            throw previewError('REVISION_CONFLICT', 'Bản nháp đã được cập nhật bởi phiên khác', 409);
        }

        const draft = division.setup_draft;
        if (draftFingerprint(draft) !== suppliedFingerprint) {
            throw previewError('DRAFT_FINGERPRINT_MISMATCH', 'Bản nháp đã thay đổi; hãy tải lại trước khi bốc thăm', 409);
        }
        const entries = validateSupportedDraft(draft);
        const selectedMemberIds = normalizedIds(draft.participants.memberIds || draft.participants.selectedMemberIds, 'memberIds');
        const [{ data: members, error: membersError }, { data: athletes, error: athletesError }] = await Promise.all([
            db.from('club_members').select('id, is_active').eq('group_id', Number(admin.groupId)).in('id', selectedMemberIds.map(Number)),
            // Global athlete identities are scoped through their tenant-checked club member.
            db.from('athletes').select('legacy_club_member_id').in('legacy_club_member_id', selectedMemberIds.map(Number)),
        ]);
        if (membersError || athletesError) {
            console.error('Preview member identity read error:', membersError || athletesError);
            throw previewError('PREVIEW_READ_FAILED', 'Không thể xác thực danh tính VĐV', 500);
        }
        const activeMemberIds = new Set((members || []).filter((member) => member.is_active !== false).map((member) => String(member.id)));
        const athleteMemberIds = new Set((athletes || []).map((athlete) => String(athlete.legacy_club_member_id)));
        if (selectedMemberIds.some((memberId) => !activeMemberIds.has(memberId))) {
            throw previewError('MEMBER_NOT_ACTIVE_IN_GROUP', 'Roster chứa VĐV không tồn tại hoặc không còn hoạt động trong CLB', 409);
        }
        if (selectedMemberIds.some((memberId) => !athleteMemberIds.has(memberId))) {
            throw previewError('ATHLETE_IDENTITY_MISSING', 'Roster chứa VĐV chưa có danh tính thi đấu', 409);
        }
        const plan = buildInternalDoublesGroupKnockoutPlan({
            tournamentId: String(tournament.id),
            divisionId: String(division.id),
            entries,
            seed: serverDrawSeed({ groupId: admin.groupId, tournamentId: tournament.id, divisionId: division.id, revision: division.setup_revision, rerollNonce: draft?.draw?.rerollNonce }),
            groupCount: draft?.format?.config?.groupCount,
            qualifiersPerGroup: draft?.format?.config?.qualifiersPerGroup ?? draft?.format?.config?.advancePerGroup,
            thirdPlaceEnabled: draft?.format?.config?.thirdPlaceEnabled === true,
            roundScoring: draft?.format?.config?.roundScoring,
            assignments: draft?.draw?.mode === 'manual' ? draft?.draw?.assignments : null,
        });
        const assignments = plan.groups.flatMap((group) => group.entryIds.map((entrantId, index) => ({
            entrantId,
            groupLabel: group.label,
            slot: index + 1,
        })));
        return NextResponse.json({
            plan,
            fingerprint: plan.fingerprint,
            schedulePreview: previewScheduleProjection(plan, draft),
            revision: Number(division.setup_revision),
            // The aggregate save route persists this shape later; preview itself never writes.
            draftUpdate: {
                state: 'draw_drafted',
                currentStep: 4,
                draw: {
                    status: 'draft',
                    seed: plan.seed,
                    mode: draft?.draw?.mode === 'manual' ? 'manual' : 'automatic',
                    previewFingerprint: plan.fingerprint,
                    assignments,
                    stagePlans: plan.stages,
                    matches: plan.matches,
                    schedulePreview: previewScheduleProjection(plan, draft),
                },
            },
        });
    } catch (error) {
        if (!error.code || error.code === 'DRAW_SEED_REQUIRED' || error.code === 'ENTRY_COUNT_TOO_SMALL'
            || error.code === 'UNSUPPORTED_GROUP_COUNT' || error.code === 'UNSUPPORTED_QUALIFIERS_PER_GROUP') {
            error.code = error.code || 'PREVIEW_INVALID';
            error.status = error.status || 400;
        }
        return errorResponse(error);
    }
}
