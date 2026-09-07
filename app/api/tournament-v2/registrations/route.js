import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { projectRegistrations } from '@/lib/tournament/access';
import { transitionRegistration } from '@/lib/tournament/interclub';
import { buildRosterAudit, canApproveRoster } from '@/lib/tournament/wizardModel';
import { transitionOpenRegistration, canAdmit, buildPairFromSolos, OpenRegError } from '@/lib/tournament/openRegistration';

// Các hành động duyệt đăng ký mở (open registration) do BTC thực hiện.
const OPEN_ACTIONS = ['admit', 'remove', 'restore', 'reject_open', 'withdraw_open', 'pair', 'approve_pair'];

const db = supabaseAdmin || supabaseServer;

// BTC (admin) được đọc đầy đủ để duyệt roster; POST/PATCH đều đã qua
// requireValidatedGroupAdmin nên dùng bản này.
const SELECT_FIELDS = 'id, group_id, division_id, tournament_club_id, athlete_id, entrant_type, status, submitted_by_actor, club_confirmation_status, confirmed_at, private_note, captain_declaration, version';
// GET chỉ cần role member trở lên, mà private_note là ghi chú nội bộ của BTC và
// captain_declaration là khai báo riêng của captain. Member không được đọc hai
// field này, nên GET của role không phải admin dùng allowlist hẹp hơn.
const MEMBER_SELECT_FIELDS = 'id, group_id, division_id, tournament_club_id, athlete_id, entrant_type, status, submitted_by_actor, club_confirmation_status, confirmed_at, version';
const PRIVATE_REGISTRATION_FIELDS = ['private_note', 'captain_declaration'];

function selectFieldsForRole(role) {
    return role === 'admin' ? SELECT_FIELDS : MEMBER_SELECT_FIELDS;
}

function domainError(error) {
    if (!error?.code || !/^[A-Z_]+$/.test(error.code)) return null;
    const status = error.code === 'INVALID_REGISTRATION_TRANSITION' ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
}

// Ánh xạ hành động BTC → hành động domain của open registration.
const OPEN_ACTION_MAP = { admit: 'admit', remove: 'remove', restore: 'restore', reject_open: 'reject', withdraw_open: 'withdraw' };

async function loadRegistrationWithMembers(id, groupId) {
    const { data: reg } = await db.from('tournament_registrations')
        .select('id, group_id, division_id, status, needs_partner, origin, contact_phone_norm')
        .eq('id', id).eq('group_id', groupId).maybeSingle();
    if (!reg) return null;
    const { data: members } = await db.from('tournament_registration_members')
        .select('id, seat, full_name, phone_norm, self_declared_phr, gender, dob')
        .eq('registration_id', id).order('seat');
    return { ...reg, members: members || [] };
}

async function handleOpenRegAction({ body, access, current }) {
    const groupId = access.groupId;

    // Ghép cặp hai VĐV solo (pair) hoặc duyệt lời mời đã được chấp nhận (approve_pair).
    if (body.action === 'pair' || body.action === 'approve_pair') {
        const { data: division } = await db.from('tournament_divisions')
            .select('id, gender_mode, registration_capacity').eq('id', current.division_id).eq('group_id', groupId).maybeSingle();
        const primary = await loadRegistrationWithMembers(body.id, groupId);
        const secondaryId = body.partner_registration_id || body.merged_id;
        if (!primary || !secondaryId) throw new OpenRegError('SOLO_MEMBER_REQUIRED', 'Thiếu VĐV để ghép cặp');
        const secondary = await loadRegistrationWithMembers(secondaryId, groupId);
        if (!secondary || secondary.division_id !== primary.division_id) throw new OpenRegError('SOLO_MEMBER_REQUIRED', 'VĐV ghép cặp không hợp lệ');

        const built = buildPairFromSolos(primary, secondary, division || {});

        // Thêm ghế 2 cho bản ghi chính, đánh dấu bản ghi phụ là merged.
        const seat2 = built.members[1];
        await db.from('tournament_registration_members').insert({
            group_id: groupId, registration_id: primary.id, seat: 2,
            full_name: seat2.full_name, phone_norm: seat2.phone_norm,
            self_declared_phr: seat2.self_declared_phr ?? null, gender: seat2.gender ?? null, dob: seat2.dob ?? null,
        });
        await db.from('tournament_registrations').update({
            status: 'merged', merged_into: primary.id, updated_at: new Date().toISOString(),
        }).eq('id', secondary.id).eq('group_id', groupId);

        // Ghép cặp (pair) và duyệt lời mời (approve_pair) đều chỉ gộp hai solo thành
        // một đăng ký đôi ở trạng thái 'submitted'. Việc nhận vào giải ('approved')
        // vẫn là bước admit riêng của BTC, để tôn trọng sức chứa/waitlist.
        const { data: updated } = await db.from('tournament_registrations').update({
            status: 'submitted', needs_partner: false, updated_at: new Date().toISOString(),
        }).eq('id', primary.id).eq('group_id', groupId).select('id, status, needs_partner').single();

        return NextResponse.json({ success: true, registration: updated, merged_id: secondary.id });
    }

    // Chuyển trạng thái đơn giản.
    const domainAction = OPEN_ACTION_MAP[body.action];
    const nextStatus = transitionOpenRegistration(current.status, domainAction);

    if (nextStatus === 'approved') {
        const { data: division } = await db.from('tournament_divisions')
            .select('registration_capacity').eq('id', current.division_id).eq('group_id', groupId).maybeSingle();
        const approvedCount = await countApproved(current.division_id, groupId);
        if (!canAdmit({ capacity: division ? division.registration_capacity : null, approvedCount })) {
            throw new OpenRegError('CAPACITY_FULL', 'Nội dung đã đủ số lượng');
        }
    }

    const patch = { status: nextStatus, updated_at: new Date().toISOString() };
    if (nextStatus === 'approved') patch.admitted_at = new Date().toISOString();
    const { data, error } = await db.from('tournament_registrations')
        .update(patch).eq('id', body.id).eq('group_id', groupId)
        .select('id, division_id, status, origin, needs_partner').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, registration: data });
}

async function countApproved(divisionId, groupId) {
    const { data } = await db.from('tournament_registrations')
        .select('id').eq('division_id', divisionId).eq('group_id', groupId).eq('status', 'approved');
    return (data || []).length;
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const divisionId = searchParams.get('divisionId');
        const tournamentId = searchParams.get('tournamentId');
        if (!divisionId && !tournamentId) {
            return NextResponse.json({ error: 'divisionId hoặc tournamentId là bắt buộc' }, { status: 400 });
        }

        // Resolve ownership through the tournament policy. This permits a
        // community/platform actor to read its own tournament while retaining
        // tenant scoping for club sessions.
        const access = await requireTournamentAccess({
            ...(divisionId ? { divisionId } : { tournamentId }),
            need: 'read',
        });
        if (!access.ok) return access.response;
        const groupId = access.groupId;
        const selectFields = access.canReadPrivate ? SELECT_FIELDS : MEMBER_SELECT_FIELDS;

        let divisionIds = divisionId ? [divisionId] : [];
        if (!divisionId) {
            const { data, error } = await db
                .from('tournament_divisions')
                .select('id')
                .eq('group_id', groupId)
                .eq('tournament_id', tournamentId);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            divisionIds = (data || []).map((row) => row.id);
            if (!divisionIds.length) return NextResponse.json({ registrations: [] });
        }

        const { data, error } = await db
            .from('tournament_registrations')
            .select(selectFields)
            .eq('group_id', groupId)
            .in('division_id', divisionIds)
            .order('id', { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ registrations: projectRegistrations(data || [], { canReadPrivate: access.canReadPrivate }) });
    } catch (err) {
        console.error('Registrations GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        // Legacy `requireValidatedGroupAdmin` remains imported for compatibility;
        // tournament ownership is enforced below by requireTournamentAccess so
        // community/platform organizers can also manage their registrations.
        const body = await request.json();
        if (!body?.division_id || !body?.tournament_club_id) {
            return NextResponse.json({ error: 'division_id và tournament_club_id là bắt buộc' }, { status: 400 });
        }

        const access = await requireTournamentAccess({ divisionId: body.division_id, need: 'write' });
        if (!access.ok) return access.response;

        // BTC nhập hộ roster: bắt buộc ghi actor + lý do, và chờ CLB xác nhận.
        let audit;
        try {
            audit = buildRosterAudit({ actor: body.actor || 'club_admin', reason: body.reason, profileId: body.profile_id || null });
        } catch (error) {
            const response = domainError(error);
            if (response) return response;
            throw error;
        }

        const { data: division, error: divisionError } = await db
            .from('tournament_divisions')
            .select('id, entrant_type')
            .eq('id', body.division_id)
            .eq('group_id', access.groupId)
            .maybeSingle();
        if (divisionError) throw divisionError;
        if (!division) return NextResponse.json({ error: 'Không tìm thấy nội dung thi đấu' }, { status: 404 });

        const { data, error } = await db
            .from('tournament_registrations')
            .insert({
                group_id: access.groupId,
                division_id: body.division_id,
                tournament_club_id: body.tournament_club_id,
                athlete_id: body.athlete_id ?? null,
                entrant_type: division.entrant_type,
                status: body.status === 'submitted' ? 'submitted' : 'draft',
                eligibility_snapshot: body.eligibility_snapshot || {},
                ...audit,
            })
            .select(SELECT_FIELDS)
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, registration: data });
    } catch (err) {
        console.error('Registrations POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        // Authorization is resolved from the registration's tournament below.
        const body = await request.json();
        if (!body?.id || !body?.action) {
            return NextResponse.json({ error: 'id và action là bắt buộc' }, { status: 400 });
        }

        const { data: current, error: currentError } = await db
            .from('tournament_registrations')
            .select(SELECT_FIELDS)
            .eq('id', body.id)
            .maybeSingle();
        if (currentError) throw currentError;
        if (!current) return NextResponse.json({ error: 'Không tìm thấy đăng ký' }, { status: 404 });

        const access = await requireTournamentAccess({ divisionId: current.division_id, need: 'write' });
        if (!access.ok) return access.response;

        // Nhánh đăng ký mở (open registration): BTC duyệt/loại/ghép cặp.
        if (OPEN_ACTIONS.includes(body.action)) {
            try {
                return await handleOpenRegAction({ body, access, current });
            } catch (error) {
                if (error instanceof OpenRegError) {
                    const status = error.code === 'INVALID_TRANSITION' || error.code === 'CAPACITY_FULL' ? 409 : 400;
                    return NextResponse.json({ error: error.message, code: error.code }, { status });
                }
                throw error;
            }
        }

        if (body.action === 'confirm_club') {
            const { data, error } = await db.rpc('confirm_tournament_registration_club', {
                p_group_id: access.groupId,
                p_registration_id: Number(body.id),
                p_expected_version: body.version == null ? Number(current.version || 1) : Number(body.version),
                p_actor: String(body.actor || 'club_admin'),
            });
            if (error) {
                const status = error.code === '40001' ? 409 : error.code === 'P0002' ? 404 : 500;
                return NextResponse.json({ error: error.message }, { status });
            }
            return NextResponse.json({ success: true, ...(data || {}) });
        }

        // Cảnh báo PHR không bao giờ chặn BTC duyệt (điều lệ Phase 3 mục 8).
        const approval = canApproveRoster();
        if (!approval.allowed) return NextResponse.json({ error: approval.reason }, { status: 409 });

        let nextStatus;
        try {
            nextStatus = transitionRegistration(current.status, body.action);
        } catch (error) {
            const response = domainError(error);
            if (response) return response;
            throw error;
        }

        const patch = { status: nextStatus, version: Number(current.version || 1) + 1, updated_at: new Date().toISOString() };
        if (body.action === 'request_changes' && body.reason) {
            patch.private_note = `BTC yêu cầu sửa: ${String(body.reason).trim()}`;
        }

        const { data, error } = await db
            .from('tournament_registrations')
            .update(patch)
            .eq('id', body.id)
            .eq('group_id', access.groupId)
            .select(SELECT_FIELDS)
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, registration: data });
    } catch (err) {
        console.error('Registrations PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
