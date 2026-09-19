import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { normalizeSetupReadiness } from '@/lib/tournament/setupReadiness';
import { actorName } from '@/lib/tournament/actorName';
import { normalizeParticipants } from '@/lib/tournament/setupParticipants';
import { resolveRepairMode, normalizeRepairReport } from '@/lib/tournament/legacyPairRepair';

// Xung dot nghiep vu nay ERRCODE 'PH409' (migration 078). Truoc day dung 40001,
// nhung 40001 la serialization_failure nen tang tren tu dong retry va request treo.
const CONFLICT_CODES = ['PH409', '40001'];

const db = supabaseAdmin || supabaseServer;

function validId(value) {
    return /^\d+$/.test(String(value || '')) && Number(value) > 0;
}

// Bang ma loi on dinh (08_FROZEN_CONTRACT muc 3). Ten ma duoc rut tu thong diep RAISE
// cua RPC; ma pg chi dung khi thong diep khong mang ma nao.
const NAMED_MUTATION_CODES = [
    'SETUP_REVISION_CONFLICT', 'ROSTER_LOCKED', 'SETUP_NOT_READY', 'ROSTER_UNLOCK_BLOCKED',
    'IDEMPOTENCY_KEY_REUSED', 'REASON_REQUIRED', 'DIVISION_ROSTER_ATHLETE_SCOPE_MISMATCH',
    'ROSTER_MEMBER_IN_ACTIVE_PAIR', 'REPAIR_BLOCKED_FIXTURES_EXIST', 'REPAIR_BLOCKED_ATHLETE_REUSE',
    'REPAIR_ENTRY_MEMBER_COUNT_INVALID', 'REPAIR_ENTRY_MEMBER_NAME_MISSING',
    'REPAIR_ENTRY_UPDATE_CONFLICT', 'SETUP_SCOPE_MISMATCH', 'SETUP_PAYLOAD_INVALID',
    'UNSEED_BLOCKED_MATCH_STARTED', 'GROUP_SEEDING_IN_PROGRESS',
    'GROUP_CORRECTION_BLOCKED_QUALIFICATION_SEEDED', 'GROUP_RESULTS_CHANGED',
    'GROUP_TOO_SMALL_FOR_TOP_TWO', 'GROUP_RANK_ENTRY_DUPLICATE',
];
const CONFLICT_MUTATION_CODES = [
    'SETUP_REVISION_CONFLICT', 'ROSTER_LOCKED', 'SETUP_NOT_READY', 'ROSTER_UNLOCK_BLOCKED',
    'IDEMPOTENCY_KEY_REUSED', 'ROSTER_MEMBER_IN_ACTIVE_PAIR', 'REPAIR_BLOCKED_FIXTURES_EXIST',
    'REPAIR_BLOCKED_ATHLETE_REUSE', 'REPAIR_ENTRY_UPDATE_CONFLICT', 'SETUP_SCOPE_MISMATCH',
    'DIVISION_ROSTER_ATHLETE_SCOPE_MISMATCH', 'UNSEED_BLOCKED_MATCH_STARTED',
    'GROUP_SEEDING_IN_PROGRESS', 'GROUP_CORRECTION_BLOCKED_QUALIFICATION_SEEDED',
    'GROUP_RESULTS_CHANGED',
];

function mutationError(error) {
    const message = error?.message || 'Không thể cập nhật thiết lập nội dung';
    const pgCode = error?.code;
    const named = NAMED_MUTATION_CODES.find((candidate) => message.includes(candidate));
    const code = named
        || (pgCode === 'P0002' ? 'DIVISION_NOT_FOUND' : null)
        || (pgCode === '23503' ? 'SETUP_SCOPE_MISMATCH' : null)
        || pgCode;
    const status = pgCode === 'P0002'
        ? 404
        : [...CONFLICT_CODES, '23503'].includes(pgCode) || CONFLICT_MUTATION_CODES.includes(code)
            ? 409
            : ['22023'].includes(pgCode) ? 400 : 400;
    return NextResponse.json({ error: message, code: code || 'SETUP_MUTATION_FAILED' }, { status });
}

function payloadError(message) {
    return NextResponse.json({ error: message, code: 'SETUP_PAYLOAD_INVALID' }, { status: 400 });
}

export async function GET(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;
        const { searchParams } = new URL(request.url);
        const divisionId = searchParams.get('divisionId') || searchParams.get('division_id');
        const tournamentId = searchParams.get('tournamentId') || searchParams.get('tournament_id');

        if (!validId(divisionId) || !validId(tournamentId)) {
            return NextResponse.json({ error: 'divisionId và tournamentId phải là số nguyên dương' }, { status: 400 });
        }

        // The RPC verifies the complete tenant/parent chain before reading counts.
        const { data, error } = await db.rpc('get_tournament_division_readiness', {
            p_group_id: Number(groupId),
            p_tournament_id: Number(tournamentId),
            p_division_id: Number(divisionId),
        });
        if (error) {
            if (error.code === 'P0002') {
                return NextResponse.json({ error: 'Không tìm thấy nội dung trong giải đấu' }, { status: 404 });
            }
            console.error('Setup readiness RPC error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const readiness = normalizeSetupReadiness(data);
        const [{ data: division, error: divisionError }, { data: athletes, error: athletesError }, { data: rosterRows, error: rosterError }, { data: entries, error: entriesError }, { data: pairs, error: pairsError }, { data: stages, error: stagesError }] = await Promise.all([
            db.from('tournament_divisions').select('id, name, play_type, pairing_mode, setup_revision, roster_lock_status').eq('id', Number(divisionId)).eq('group_id', Number(groupId)).eq('tournament_id', Number(tournamentId)).maybeSingle(),
            db.from('tournament_athletes').select('id, display_name_snapshot, tournament_club_id, phr_rating, phr_status').eq('group_id', Number(groupId)).eq('tournament_id', Number(tournamentId)).order('id'),
            db.from('tournament_division_roster_members').select('tournament_athlete_id').eq('group_id', Number(groupId)).eq('division_id', Number(divisionId)).order('tournament_athlete_id'),
            db.from('tournament_entries').select('id, pair_id, name_snapshot, status, seed').eq('group_id', Number(groupId)).eq('division_id', Number(divisionId)).order('id'),
            db.from('tournament_pairs').select('id, name_snapshot, status, pairing_mode').eq('group_id', Number(groupId)).eq('division_id', Number(divisionId)).in('status', ['confirmed', 'locked']).order('id'),
            db.from('tournament_stages').select('id, name, schedule_format, stage_order, status, config').eq('group_id', Number(groupId)).eq('tournament_id', Number(tournamentId)).eq('division_id', Number(divisionId)).order('stage_order'),
        ]);
        const aggregateError = divisionError || athletesError || rosterError || entriesError || pairsError || stagesError;
        if (aggregateError) {
            console.error('Setup aggregate query error:', aggregateError);
            return NextResponse.json({ error: aggregateError.message }, { status: 500 });
        }
        if (!division) return NextResponse.json({ error: 'Không tìm thấy nội dung trong giải đấu' }, { status: 404 });

        const pairIds = (pairs || []).map((pair) => pair.id);
        let members = [];
        if (pairIds.length) {
            const { data: pairMembers, error: pairMembersError } = await db.from('tournament_pair_members')
                .select('pair_id, tournament_athlete_id, role').eq('group_id', Number(groupId)).in('pair_id', pairIds).order('pair_id');
            if (pairMembersError) return NextResponse.json({ error: pairMembersError.message }, { status: 500 });
            members = pairMembers || [];
        }
        const membersByPair = new Map();
        for (const member of members) {
            if (!membersByPair.has(member.pair_id)) membersByPair.set(member.pair_id, []);
            membersByPair.get(member.pair_id).push(member);
        }
        return NextResponse.json({
            readiness,
            division,
            roster: { athlete_ids: (rosterRows || []).map((row) => row.tournament_athlete_id), athletes: athletes || [] },
            pairs: (pairs || []).map((pair) => ({ ...pair, members: membersByPair.get(pair.id) || [], entry_id: (entries || []).find((entry) => entry.pair_id === pair.id)?.id || null })),
            entries: entries || [],
            stages: stages || [],
        });
    } catch (err) {
        console.error('Setup GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;
        const body = await request.json();
        const tournamentId = body?.tournament_id ?? body?.tournamentId;
        const divisionId = body?.division_id ?? body?.divisionId;
        const action = body?.action;
        const expectedRevision = Number(body?.expected_setup_revision ?? body?.expectedSetupRevision);
        // Tự sinh khóa khi caller quên là âm thầm bỏ mất tính chống trùng: lần thử lại
        // sẽ mang khóa mới và máy chủ không phát lại được kết quả cũ. Bắt buộc phải có.
        const rawIdempotencyKey = body?.idempotency_key ?? body?.idempotencyKey;
        const idempotencyKey = String(rawIdempotencyKey ?? '').trim();

        if (!validId(tournamentId) || !validId(divisionId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
            return NextResponse.json({ error: 'tournament_id, division_id và expected_setup_revision hợp lệ là bắt buộc', code: 'SETUP_PAYLOAD_INVALID' }, { status: 400 });
        }
        if (rawIdempotencyKey == null || !idempotencyKey || idempotencyKey.length > 200) {
            return NextResponse.json({ error: 'idempotency_key là bắt buộc và phải dài 1-200 ký tự', code: 'SETUP_PAYLOAD_INVALID' }, { status: 400 });
        }

        if (action === 'replace_roster') {
            const athleteIds = body?.athlete_ids ?? body?.athleteIds;
            if (!Array.isArray(athleteIds) || athleteIds.some((id) => !validId(id))) {
                return NextResponse.json({ error: 'athlete_ids phải là mảng mã vận động viên hợp lệ', code: 'SETUP_PAYLOAD_INVALID' }, { status: 400 });
            }
            const { data, error } = await db.rpc('replace_tournament_division_roster_revisioned', {
                p_group_id: Number(groupId), p_tournament_id: Number(tournamentId), p_division_id: Number(divisionId),
                p_athlete_ids: athleteIds.map(Number), p_expected_setup_revision: expectedRevision, p_idempotency_key: idempotencyKey,
            });
            if (error) return mutationError(error);
            return NextResponse.json({ success: true, ...(data || {}) });
        }

        if (action === 'lock_roster' || action === 'unlock_roster') {
            const { data, error } = await db.rpc('set_tournament_division_roster_lock_revisioned', {
                p_group_id: Number(groupId), p_tournament_id: Number(tournamentId), p_division_id: Number(divisionId),
                p_lock: action === 'lock_roster', p_actor: actorName(adminCheck), p_reason: String(body?.reason || ''),
                p_expected_setup_revision: expectedRevision, p_idempotency_key: idempotencyKey,
            });
            if (error) return mutationError(error);
            return NextResponse.json({ success: true, ...(data || {}) });
        }

        // Duong phuc hoi cho guard E5: go seed play-off de sua lai ket qua vong bang.
        // RPC tu choi neu bat ky tran vong sau nao da bat dau hoac da co ti so.
        if (action === 'unseed_playoff') {
            const groupStageId = body?.group_stage_id ?? body?.groupStageId;
            if (!validId(groupStageId)) {
                return NextResponse.json({ error: 'group_stage_id hợp lệ là bắt buộc', code: 'SETUP_PAYLOAD_INVALID' }, { status: 400 });
            }
            const { data, error } = await db.rpc('unseed_division_group_playoff', {
                p_group_id: Number(groupId), p_tournament_id: Number(tournamentId), p_division_id: Number(divisionId),
                p_group_stage_id: Number(groupStageId), p_expected_setup_revision: expectedRevision,
                p_idempotency_key: idempotencyKey,
            });
            if (error) return mutationError(error);
            return NextResponse.json({ success: true, ...(data || {}) });
        }

        if (action === 'configure_top_two_playoff') {
            const groupStageId = body?.group_stage_id ?? body?.groupStageId;
            const playoffStageId = body?.playoff_stage_id ?? body?.playoffStageId;
            if (!validId(groupStageId) || !validId(playoffStageId)) {
                return NextResponse.json({ error: 'group_stage_id và playoff_stage_id hợp lệ là bắt buộc', code: 'SETUP_PAYLOAD_INVALID' }, { status: 400 });
            }
            const { data, error } = await db.rpc('configure_top_two_group_playoff_revisioned', {
                p_group_id: Number(groupId), p_tournament_id: Number(tournamentId), p_division_id: Number(divisionId),
                p_group_stage_id: Number(groupStageId), p_playoff_stage_id: Number(playoffStageId),
                p_bronze: Boolean(body?.bronze), p_expected_setup_revision: expectedRevision, p_idempotency_key: idempotencyKey,
            });
            if (error) return mutationError(error);
            return NextResponse.json({ success: true, ...(data || {}) });
        }
        if (action === 'replace_participants') {
            const tournamentClubId = body?.tournament_club_id ?? body?.tournamentClubId;
            if (!validId(tournamentClubId)) {
                return payloadError('tournament_club_id hợp lệ là bắt buộc');
            }
            const rawParticipants = body?.participants;
            if (!Array.isArray(rawParticipants) || rawParticipants.length < 1 || rawParticipants.length > 128) {
                return payloadError('participants phải là mảng từ 1 đến 128 VĐV');
            }
            const uniqueClientRefs = new Set(rawParticipants.map((participant) => participant?.client_ref));
            if (uniqueClientRefs.size !== rawParticipants.length) {
                return payloadError('client_ref bị trùng trong danh sách');
            }
            let participants;
            try {
                participants = normalizeParticipants(rawParticipants);
            } catch (validationError) {
                return payloadError(validationError.message);
            }
            const { data, error } = await db.rpc('replace_division_participants_revisioned', {
                p_group_id: Number(groupId), p_tournament_id: Number(tournamentId), p_division_id: Number(divisionId),
                p_tournament_club_id: Number(tournamentClubId), p_participants: participants,
                p_expected_setup_revision: expectedRevision, p_idempotency_key: idempotencyKey,
            });
            if (error) return mutationError(error);
            return NextResponse.json({ success: true, ...(data || {}) });
        }

        if (action === 'repair_legacy_pairs') {
            let repairMode;
            try {
                repairMode = resolveRepairMode(body);
            } catch (validationError) {
                if (validationError.code === 'REPAIR_CONFIRMATION_REQUIRED') {
                    return NextResponse.json({ error: validationError.message, code: 'REPAIR_CONFIRMATION_REQUIRED' }, { status: 400 });
                }
                return payloadError(validationError.message);
            }
            const dryRun = (body?.dry_run ?? body?.dryRun) !== false;
            const confirmApply = (body?.confirm_apply ?? body?.confirmApply) === true;
            if (repairMode.dryRun !== dryRun || (!dryRun && !confirmApply)) {
                return NextResponse.json({ error: 'Cần confirm_apply: true để áp dụng sửa tương thích', code: 'REPAIR_CONFIRMATION_REQUIRED' }, { status: 400 });
            }
            const { data, error } = await db.rpc('repair_legacy_division_pair_identity', {
                p_group_id: Number(groupId), p_tournament_id: Number(tournamentId), p_division_id: Number(divisionId),
                p_dry_run: dryRun, p_expected_setup_revision: expectedRevision, p_idempotency_key: idempotencyKey,
            });
            if (error) return mutationError(error);
            // RPC đã COMMIT ở đây. Nếu báo cáo trả về không đúng dạng thì đó là lỗi
            // hiển thị, KHÔNG phải lỗi ghi: trả 200 kèm cảnh báo, tuyệt đối không
            // trả 500 cho một thao tác đã ghi thành công.
            try {
                return NextResponse.json({ success: true, ...normalizeRepairReport(data) });
            } catch (reportError) {
                console.error('Repair report malformed after commit:', reportError);
                return NextResponse.json({
                    success: true,
                    report_warning: 'REPAIR_REPORT_MALFORMED',
                    report_error: reportError?.message || 'INVALID_REPAIR_REPORT',
                    raw: data ?? null,
                });
            }
        }
        return NextResponse.json({ error: 'action không hợp lệ', code: 'SETUP_PAYLOAD_INVALID' }, { status: 400 });
    } catch (err) {
        console.error('Setup POST error:', err);
        return NextResponse.json({ error: err.message, code: err.code || 'SETUP_MUTATION_FAILED' }, { status: 500 });
    }
}
