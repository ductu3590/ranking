// CLB tham dự giải giao hữu liên CLB — phía CHỦ NHÀ (spec Epic 3 F1 §6.1, ADR-007 D39, D46, D47).
//   GET  ?mode=available[&tournamentId=][&q=]  danh sách mọi CLB PickHub để mời (chỉ id, name) + hạn mức CLB khách
//   GET  ?tournamentId=                       CLB của giải (HostClubView) + cửa sổ đăng ký + hạn mức
//   POST { tournament_id, club_id, quota?, invitation_note? }        mời / mời lại → RPC friendly_invite_club
//   PATCH { id, action, expected_version, note?, quota? }             hành động chủ nhà → RPC friendly_club_action
// Hạn mức CLB khách chỉ đến từ friendlyEntitlements (không bao giờ từ body); token link mời do server sinh, chỉ băm
// đi vào DB, token thô trả đúng một lần trong response (invitePath).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { registrationWindow, statusLabel } from '@/lib/tournament/friendlyClubs';
import { resolveFriendlyEntitlements, guestClubLimitView } from '@/lib/tournament/friendlyEntitlements';
import { issueInviteToken, invitePath } from '@/lib/tournament/friendlyInviteLink';
import {
    FRIENDLY_DIVISION_TEMPLATE,
    HOST_CLUB_FIELDS,
    HOST_ACTIONS,
    positiveId,
    friendlyErrorPayload,
    rpcErrorPayload,
    projectHostClubRow,
    parseQuotaInput,
    parseInvitationNote,
    hostActionPayload,
    escapeLike,
    parseClubSearch,
    systemGroupId,
} from '@/lib/tournament/friendlyServer';

const db = supabaseAdmin || supabaseServer;
const NO_STORE = { 'Cache-Control': 'no-store' };

function reply({ status, body }) {
    return NextResponse.json(body, { status });
}

function fail(code, params) {
    return reply(friendlyErrorPayload(code, params));
}

// Hạn mức CLB khách của giải: điểm quyết định duy nhất là friendlyEntitlements (D46).
async function loadLimit(groupId, tournamentId) {
    const entitlements = await resolveFriendlyEntitlements({ db, groupId });
    const { data, error } = await db.from('tournament_clubs')
        .select('id, group_id, club_id, invitation_status')
        .eq('group_id', groupId).eq('tournament_id', tournamentId);
    if (error) throw error;
    return { entitlements, rows: data || [], limit: guestClubLimitView({ maxGuestClubs: entitlements.maxGuestClubs, rows: data || [] }) };
}

async function loadWindow(groupId, tournamentId) {
    const [{ data: tournament, error: tournamentError }, { data: division, error: divisionError }] = await Promise.all([
        db.from('tournaments').select('id, settings').eq('id', tournamentId).eq('group_id', groupId).maybeSingle(),
        db.from('tournament_divisions').select('id, roster_lock_status')
            .eq('group_id', groupId).eq('tournament_id', tournamentId).eq('competition_template', FRIENDLY_DIVISION_TEMPLATE)
            .order('id').limit(1).maybeSingle(),
    ]);
    if (tournamentError || divisionError) throw tournamentError || divisionError;
    return registrationWindow({ settings: tournament?.settings, rosterLockStatus: division?.roster_lock_status, now: new Date() });
}

// Tên hiển thị: CLB PickHub theo groups (không logo_url — data-URL nặng), dòng CLB ngoài cũ theo tournament_external_clubs.
async function clubNames(rows, groupId) {
    const clubIds = [...new Set(rows.map((row) => row.club_id).filter((id) => id != null))];
    const externalIds = [...new Set(rows.map((row) => row.external_club_id).filter((id) => id != null))];
    const [groupsResult, externalResult] = await Promise.all([
        clubIds.length ? db.from('groups').select('id, name').in('id', clubIds) : Promise.resolve({ data: [] }),
        externalIds.length ? db.from('tournament_external_clubs').select('id, name').eq('group_id', groupId).in('id', externalIds) : Promise.resolve({ data: [] }),
    ]);
    if (groupsResult.error || externalResult.error) throw groupsResult.error || externalResult.error;
    const groups = new Map((groupsResult.data || []).map((row) => [String(row.id), row.name]));
    const external = new Map((externalResult.data || []).map((row) => [String(row.id), row.name]));
    return (row) => (row.club_id != null
        ? (groups.get(String(row.club_id)) || `CLB #${row.club_id}`)
        : (external.get(String(row.external_club_id)) || `CLB ngoài #${row.external_club_id}`));
}

async function hostView(row, groupId) {
    const nameOf = await clubNames([row], groupId);
    return projectHostClubRow(row, { clubName: nameOf(row) });
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const rawTournamentId = searchParams.get('tournamentId');

        // Danh sách mọi CLB PickHub (D46): chỉ id + name; không code (mã đăng nhập CLB), không logo_url.
        if (searchParams.get('mode') === 'available') {
            const adminCheck = await requireValidatedGroupAdmin();
            if (!adminCheck.ok) return adminCheck.response;
            const search = parseClubSearch(searchParams.get('q'));
            if (!search.ok) return fail(search.code);
            let access = null;
            if (rawTournamentId != null) {
                const tournamentId = positiveId(rawTournamentId);
                if (!tournamentId) return fail('SETUP_PAYLOAD_INVALID');
                access = await requireTournamentAccess({ tournamentId, need: 'write' });
                if (!access.ok) return access.response;
            }
            // Bỏ CLB của phiên và CLB hệ thống (PICKHUB_SYSTEM_GROUP_ID nếu cấu hình).
            let query = db.from('groups').select('id, name').neq('id', adminCheck.groupId);
            const systemId = systemGroupId();
            if (systemId) query = query.neq('id', systemId);
            if (search.q) query = query.ilike('name', `%${escapeLike(search.q)}%`);
            const { data, error } = await query.order('name').limit(200);
            if (error) throw error;
            const clubs = (data || []).map((club) => ({ id: club.id, name: club.name }));
            if (!access) return NextResponse.json({ clubs });

            const { rows, limit } = await loadLimit(access.groupId, access.tournament.id);
            const byClub = new Map(rows.filter((row) => row.club_id != null).map((row) => [String(row.club_id), row]));
            return NextResponse.json({
                clubs: clubs.map((club) => {
                    const row = byClub.get(String(club.id));
                    return {
                        ...club,
                        invitation: row ? { id: row.id, status: row.invitation_status, statusLabel: statusLabel(row.invitation_status, 'host') } : null,
                    };
                }),
                limit,
            });
        }

        const tournamentId = positiveId(rawTournamentId);
        if (!tournamentId) return fail('SETUP_PAYLOAD_INVALID');
        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;

        const { data, error } = await db.from('tournament_clubs')
            .select(HOST_CLUB_FIELDS)
            .eq('group_id', access.groupId).eq('tournament_id', tournamentId).order('id');
        if (error) throw error;
        const rows = data || [];
        const [nameOf, window, { limit }] = await Promise.all([
            clubNames(rows, access.groupId),
            loadWindow(access.groupId, tournamentId),
            loadLimit(access.groupId, tournamentId),
        ]);
        return NextResponse.json({
            window,
            limit,
            clubs: rows.map((row) => projectHostClubRow(row, { clubName: nameOf(row) })),
        });
    } catch (error) {
        console.error('Tournament clubs GET error:', error);
        return NextResponse.json({ error: 'Không tải được danh sách CLB.', code: 'FRIENDLY_READ_FAILED' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('SETUP_PAYLOAD_INVALID');
        // D39: chỉ mời CLB có trên PickHub.
        if (body.external_club_id != null || (typeof body.external_club_name === 'string' && body.external_club_name.trim())) {
            return fail('EXTERNAL_CLUB_NOT_SUPPORTED');
        }
        const tournamentId = positiveId(body.tournament_id);
        const clubId = positiveId(body.club_id);
        if (!tournamentId || !clubId) return fail('SETUP_PAYLOAD_INVALID');
        if (clubId === systemGroupId()) return fail('CLUB_NOT_FOUND');
        const quota = parseQuotaInput(body.quota);
        if (!quota.ok) return fail(quota.code);
        const note = parseInvitationNote(body.invitation_note);
        if (!note.ok) return fail(note.code);

        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;

        const entitlements = await resolveFriendlyEntitlements({ db, groupId: access.groupId });
        const token = issueInviteToken();
        const { data, error } = await db.rpc('friendly_invite_club', {
            p_group_id: Number(access.groupId),
            p_tournament_id: tournamentId,
            p_club_id: clubId,
            p_quota: quota.quota,
            p_note: note.note,
            p_max_guest_clubs: entitlements.maxGuestClubs,
            p_invite_token_hash: token.tokenHash,
        });
        if (error) {
            const limitHit = String(error.message || '').includes('FRIENDLY_CLUB_LIMIT_REACHED');
            const payload = rpcErrorPayload(error, limitHit ? { max: entitlements.maxGuestClubs } : undefined);
            if (payload.status >= 500) console.error('friendly_invite_club error:', error);
            return reply(payload);
        }
        const [club, { limit }] = await Promise.all([hostView(data, access.groupId), loadLimit(access.groupId, tournamentId)]);
        // invitePath chỉ có trong response này; client ghép window.location.origin.
        return NextResponse.json({ club, invitePath: invitePath(token.rawToken), limit }, { headers: NO_STORE });
    } catch (error) {
        console.error('Tournament clubs POST error:', error);
        return NextResponse.json({ error: 'Không mời được CLB. Thử lại sau.', code: 'FRIENDLY_MUTATION_FAILED' }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('SETUP_PAYLOAD_INVALID');
        const id = positiveId(body.id);
        const expectedVersion = positiveId(body.expected_version);
        const action = typeof body.action === 'string' ? body.action : '';
        if (!id || !expectedVersion || !HOST_ACTIONS.includes(action)) return fail('SETUP_PAYLOAD_INVALID');
        const input = { note: body.note };
        if (Object.prototype.hasOwnProperty.call(body, 'quota')) input.quota = body.quota;
        const prepared = hostActionPayload(action, input);
        if (!prepared.ok) return fail(prepared.code);

        const { data: row, error: rowError } = await db.from('tournament_clubs')
            .select('id, group_id, tournament_id').eq('id', id).maybeSingle();
        if (rowError) throw rowError;
        if (!row) return fail('FRIENDLY_CLUB_NOT_FOUND');
        const access = await requireTournamentAccess({ tournamentId: row.tournament_id, need: 'write' });
        if (!access.ok) return access.response;
        if (String(row.group_id) !== String(access.groupId)) return fail('FRIENDLY_CLUB_NOT_FOUND');

        const payload = { ...prepared.payload };
        let token = null;
        if (action === 'rotate_link') {
            token = issueInviteToken();
            payload.inviteTokenHash = token.tokenHash;
        }
        const { data, error } = await db.rpc('friendly_club_action', {
            p_actor_group_id: Number(access.groupId),
            p_side: 'host',
            p_tournament_club_id: id,
            p_action: action,
            p_expected_version: expectedVersion,
            p_payload: payload,
        });
        if (error) {
            const response = rpcErrorPayload(error);
            if (response.status >= 500) console.error('friendly_club_action (host) error:', error);
            return reply(response);
        }
        const club = await hostView(data, access.groupId);
        if (token) return NextResponse.json({ club, invitePath: invitePath(token.rawToken) }, { headers: NO_STORE });
        return NextResponse.json({ club });
    } catch (error) {
        console.error('Tournament clubs PATCH error:', error);
        return NextResponse.json({ error: 'Không cập nhật được lời mời. Thử lại sau.', code: 'FRIENDLY_MUTATION_FAILED' }, { status: 500 });
    }
}
