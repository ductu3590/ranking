import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { transitionTournamentClub, validateTournamentClubReference } from '@/lib/tournament/interclub';

const db = supabaseAdmin || supabaseServer;

const SELECT_FIELDS = 'id, group_id, tournament_id, club_id, external_club_id, invitation_status, quota, invitation_note, version';

function domainError(error) {
    if (!error?.code || !/^[A-Z_]+$/.test(error.code)) return null;
    const status = error.code === 'INVALID_CLUB_TRANSITION' ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
}

// Gắn tên hiển thị cho CLB PickHub và CLB ngoài hệ thống để UI không phải
// tự đoán từ id.
async function decorateClubNames(rows, groupId) {
    const clubIds = [...new Set(rows.map((row) => row.club_id).filter((id) => id != null))];
    const externalIds = [...new Set(rows.map((row) => row.external_club_id).filter((id) => id != null))];
    const [groupsResult, externalResult] = await Promise.all([
        clubIds.length ? db.from('groups').select('id, name').in('id', clubIds) : Promise.resolve({ data: [] }),
        externalIds.length ? db.from('tournament_external_clubs').select('id, name, contact_name, contact_channel').eq('group_id', groupId).in('id', externalIds) : Promise.resolve({ data: [] }),
    ]);
    const groupNames = new Map((groupsResult.data || []).map((row) => [String(row.id), row.name]));
    const externalNames = new Map((externalResult.data || []).map((row) => [String(row.id), row]));
    return rows.map((row) => ({
        ...row,
        is_external: row.external_club_id != null,
        name: row.club_id != null
            ? (groupNames.get(String(row.club_id)) || `CLB #${row.club_id}`)
            : (externalNames.get(String(row.external_club_id))?.name || `CLB ngoài #${row.external_club_id}`),
    }));
}

export async function GET(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });

        if (searchParams.get('mode') === 'available') {
            const { data, error } = await db.from('groups').select('id, name').neq('id', adminCheck.groupId).order('name');
            if (error) throw error;
            return NextResponse.json({ clubs: data || [] });
        }

        const { data, error } = await db.from('tournament_clubs')
            .select(SELECT_FIELDS)
            .eq('group_id', adminCheck.groupId).eq('tournament_id', tournamentId).order('id');
        if (error) throw error;
        return NextResponse.json({ clubs: await decorateClubNames(data || [], adminCheck.groupId) });
    } catch (error) {
        console.error('Tournament clubs GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const body = await request.json();
        const tournamentId = body?.tournament_id;
        const quota = body?.quota == null || body.quota === '' ? null : Number(body.quota);
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournament_id là bắt buộc' }, { status: 400 });
        }
        if (quota != null && (!Number.isInteger(quota) || quota <= 0)) {
            return NextResponse.json({ error: 'quota phải là số nguyên dương' }, { status: 400 });
        }

        const { data: tournament, error: tournamentError } = await db.from('tournaments')
            .select('id').eq('id', tournamentId).eq('group_id', adminCheck.groupId).maybeSingle();
        if (tournamentError) throw tournamentError;
        if (!tournament) return NextResponse.json({ error: 'Không tìm thấy giải trong CLB hiện tại' }, { status: 404 });

        // CLB ngoài PickHub: tạo bản ghi trong phạm vi giải, không tạo group mới.
        let externalClubId = body?.external_club_id ?? null;
        const externalName = String(body?.external_club_name || '').trim();
        if (!externalClubId && externalName) {
            const { data: external, error: externalError } = await db.from('tournament_external_clubs')
                .upsert({
                    group_id: adminCheck.groupId,
                    name: externalName,
                    contact_name: body?.contact_name || null,
                    contact_channel: body?.contact_channel || null,
                }, { onConflict: 'group_id,name' })
                .select('id, name')
                .single();
            if (externalError) return NextResponse.json({ error: externalError.message }, { status: 500 });
            externalClubId = external.id;
        }

        const clubId = body?.club_id == null || body.club_id === '' ? null : Number(body.club_id);
        let reference;
        try {
            reference = validateTournamentClubReference({ club_id: clubId, external_club_id: externalClubId });
        } catch (error) {
            const response = domainError(error);
            if (response) return response;
            throw error;
        }
        if (reference.club_id != null && !Number.isInteger(reference.club_id)) {
            return NextResponse.json({ error: 'club_id không hợp lệ' }, { status: 400 });
        }

        const isHost = reference.club_id != null && reference.club_id === Number(adminCheck.groupId);
        const { data, error } = await db.from('tournament_clubs').insert({
            group_id: adminCheck.groupId,
            tournament_id: tournamentId,
            club_id: reference.club_id,
            external_club_id: reference.external_club_id,
            quota,
            invitation_note: body?.invitation_note || null,
            // CLB chủ giải tham gia sẵn; CLB được mời phải tự xác nhận.
            invitation_status: isHost ? 'accepted' : 'invited',
        }).select(SELECT_FIELDS).single();
        if (error) throw error;
        const [decorated] = await decorateClubNames([data], adminCheck.groupId);
        return NextResponse.json({ success: true, club: decorated });
    } catch (error) {
        console.error('Tournament clubs POST error:', error);
        const conflict = error.code === '23505';
        return NextResponse.json({ error: conflict ? 'CLB đã được mời vào giải' : error.message }, { status: conflict ? 409 : 500 });
    }
}

export async function PATCH(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const body = await request.json();
        if (!body?.id) return NextResponse.json({ error: 'id là bắt buộc' }, { status: 400 });

        const { data: current, error: currentError } = await db.from('tournament_clubs')
            .select(SELECT_FIELDS)
            .eq('id', body.id).eq('group_id', adminCheck.groupId).maybeSingle();
        if (currentError) throw currentError;
        if (!current) return NextResponse.json({ error: 'Không tìm thấy CLB tham dự' }, { status: 404 });

        const patch = { updated_at: new Date().toISOString(), version: Number(current.version || 1) + 1 };
        if (body.action) {
            try {
                patch.invitation_status = transitionTournamentClub(current.invitation_status, body.action);
            } catch (error) {
                const response = domainError(error);
                if (response) return response;
                throw error;
            }
        }
        if (body.quota != null && body.quota !== '') {
            const quota = Number(body.quota);
            if (!Number.isInteger(quota) || quota <= 0) {
                return NextResponse.json({ error: 'quota phải là số nguyên dương' }, { status: 400 });
            }
            patch.quota = quota;
        }
        if (body.invitation_note != null) patch.invitation_note = String(body.invitation_note).trim() || null;

        const { data, error } = await db.from('tournament_clubs')
            .update(patch)
            .eq('id', body.id).eq('group_id', adminCheck.groupId)
            .select(SELECT_FIELDS).single();
        if (error) throw error;
        const [decorated] = await decorateClubNames([data], adminCheck.groupId);
        return NextResponse.json({ success: true, club: decorated });
    } catch (error) {
        console.error('Tournament clubs PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
