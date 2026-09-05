import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';
import { transitionRegistration } from '@/lib/tournament/interclub';
import { buildRosterAudit, canApproveRoster } from '@/lib/tournament/wizardModel';

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

export async function GET(request) {
    try {
        const scope = getClubScope();
        if (!scope.ok) return scope.response;
        const { searchParams } = new URL(request.url);
        const divisionId = searchParams.get('divisionId');
        const tournamentId = searchParams.get('tournamentId');
        if (!divisionId && !tournamentId) {
            return NextResponse.json({ error: 'divisionId hoặc tournamentId là bắt buộc' }, { status: 400 });
        }

        let divisionIds = divisionId ? [divisionId] : [];
        if (!divisionId) {
            const { data, error } = await db
                .from('tournament_divisions')
                .select('id')
                .eq('group_id', scope.groupId)
                .eq('tournament_id', tournamentId);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            divisionIds = (data || []).map((row) => row.id);
            if (!divisionIds.length) return NextResponse.json({ registrations: [] });
        }

        const { data, error } = await db
            .from('tournament_registrations')
            .select(SELECT_FIELDS)
            .eq('group_id', scope.groupId)
            .in('division_id', divisionIds)
            .order('id', { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ registrations: data || [] });
    } catch (err) {
        console.error('Registrations GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const body = await request.json();
        if (!body?.division_id || !body?.tournament_club_id) {
            return NextResponse.json({ error: 'division_id và tournament_club_id là bắt buộc' }, { status: 400 });
        }

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
            .eq('group_id', adminCheck.groupId)
            .maybeSingle();
        if (divisionError) throw divisionError;
        if (!division) return NextResponse.json({ error: 'Không tìm thấy nội dung thi đấu' }, { status: 404 });

        const { data, error } = await db
            .from('tournament_registrations')
            .insert({
                group_id: adminCheck.groupId,
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
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const body = await request.json();
        if (!body?.id || !body?.action) {
            return NextResponse.json({ error: 'id và action là bắt buộc' }, { status: 400 });
        }

        const { data: current, error: currentError } = await db
            .from('tournament_registrations')
            .select(SELECT_FIELDS)
            .eq('id', body.id)
            .eq('group_id', adminCheck.groupId)
            .maybeSingle();
        if (currentError) throw currentError;
        if (!current) return NextResponse.json({ error: 'Không tìm thấy đăng ký' }, { status: 404 });

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
        if (body.action === 'approve') {
            patch.club_confirmation_status = 'confirmed';
            patch.confirmed_at = new Date().toISOString();
        }
        if (body.action === 'request_changes' && body.reason) {
            patch.private_note = `BTC yêu cầu sửa: ${String(body.reason).trim()}`;
        }

        const { data, error } = await db
            .from('tournament_registrations')
            .update(patch)
            .eq('id', body.id)
            .eq('group_id', adminCheck.groupId)
            .select(SELECT_FIELDS)
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, registration: data });
    } catch (err) {
        console.error('Registrations PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
