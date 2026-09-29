import { NextResponse } from 'next/server';

import { supabaseAdmin } from './supabaseAdmin';
import { parseRpcError } from './tournament/communityErrors';
import { messageFor, rateLimitedMessage } from './tournament/communityMessages';
import { assertNoForbiddenKeys, projectPublicPairs, publicSummary } from './tournament/communityPublic';
import {
    communityRegistrationState,
    feeState,
    isRegistrationLocked,
} from './tournament/communityRegistration';
import { isRegistrationOpen, waitlistView } from './tournament/openRegistration';

// Phần I/O phía server của lát C2 (Epic 4): gọi RPC, ánh xạ lỗi nghiệp vụ, nạp dữ liệu cho VĐV/công khai.
// Mọi chiếu dữ liệu ra ngoài chỉ chọn cột cần thiết; payload công khai đi qua assertNoForbiddenKeys.

const NO_STORE = { 'Cache-Control': 'no-store' };
const ACTIVE_STATUSES = ['submitted', 'approved', 'awaiting_partner'];

export function communityJson(body, status = 200) {
    return NextResponse.json(body, { status, headers: NO_STORE });
}

export function communityError(code, status) {
    return communityJson({ error: messageFor(code), code }, status);
}

export function communityRateLimited(rate) {
    const response = communityJson({
        error: rateLimitedMessage(rate.retryAfterSeconds),
        code: 'RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds,
    }, 429);
    response.headers.set('Retry-After', String(Math.max(1, rate.retryAfterSeconds)));
    return response;
}

// Gọi RPC ghi. Lỗi nghiệp vụ (PH409) → phản hồi có mã ổn định; lỗi khác → 500 chung (không lộ chi tiết DB).
export async function callCommunityRpc(name, args) {
    if (!supabaseAdmin) return { ok: false, response: communityError('UNAVAILABLE', 503) };
    const { data, error } = await supabaseAdmin.rpc(name, args);
    if (!error) return { ok: true, data };
    const parsed = parseRpcError(error);
    if (parsed) return { ok: false, response: communityError(parsed.code, parsed.status) };
    console.error(`RPC ${name} failed:`, error.message);
    return { ok: false, response: communityError('INTERNAL', 500) };
}

function unique(values) {
    return [...new Set(values.filter((value) => value != null))];
}

function groupBy(rows, key) {
    const map = new Map();
    for (const row of rows || []) {
        const bucket = map.get(row[key]) || [];
        bucket.push(row);
        map.set(row[key], bucket);
    }
    return map;
}

async function selectRows(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// ===== Đơn của tôi + lời mời đến (PLC-06, PLC-05) =====
export async function loadMyCommunity(accountId) {
    const [memberRows, ownRows] = await Promise.all([
        selectRows(supabaseAdmin.from('tournament_registration_members').select('registration_id').eq('player_account_id', accountId)),
        selectRows(supabaseAdmin.from('tournament_registrations').select('id').eq('player_account_id', accountId)),
    ]);
    const ids = unique([...memberRows.map((row) => row.registration_id), ...ownRows.map((row) => row.id)]);
    // Lời mời gửi tới TÀI KHOẢN (theo SĐT) vẫn phải hiện dù người nhận chưa có đơn nào.
    if (!ids.length) return { registrations: [], invitesIn: await loadInvitesIn(accountId, []) };

    const regs = await selectRows(supabaseAdmin.from('tournament_registrations')
        .select('id, division_id, status, version, fee_confirmed_at, partner_link_expires_at, created_at, player_account_id')
        .in('id', ids).neq('status', 'merged').order('created_at', { ascending: false }));
    if (!regs.length) return { registrations: [], invitesIn: await loadInvitesIn(accountId, []) };
    const regIds = regs.map((reg) => reg.id);
    const divisionIds = unique(regs.map((reg) => reg.division_id));

    const [members, divisions, invitesOut, approvedRows, submittedRows] = await Promise.all([
        selectRows(supabaseAdmin.from('tournament_registration_members').select('registration_id, seat, full_name, player_account_id').in('registration_id', regIds)),
        selectRows(supabaseAdmin.from('tournament_divisions').select('id, tournament_id, name, entrant_type, gender_mode, entry_fee, registration_capacity').in('id', divisionIds)),
        selectRows(supabaseAdmin.from('tournament_pair_invites').select('from_registration_id').eq('status', 'pending').in('from_registration_id', regIds)),
        selectRows(supabaseAdmin.from('tournament_registrations').select('id, division_id').in('division_id', divisionIds).eq('status', 'approved')),
        selectRows(supabaseAdmin.from('tournament_registrations').select('id, division_id, queue_seq').in('division_id', divisionIds).eq('status', 'submitted')),
    ]);
    const tournaments = await selectRows(supabaseAdmin.from('tournaments')
        .select('id, name, public_slug, event_date, location, status')
        .in('id', unique(divisions.map((division) => division.tournament_id))));

    const membersByReg = groupBy(members, 'registration_id');
    const divisionById = new Map(divisions.map((division) => [division.id, division]));
    const tournamentById = new Map(tournaments.map((tournament) => [tournament.id, tournament]));
    const approvedByDivision = groupBy(approvedRows, 'division_id');
    const submittedByDivision = groupBy(submittedRows, 'division_id');
    const outCount = groupBy(invitesOut, 'from_registration_id');

    const waitlistPosition = new Map();
    for (const division of divisions) {
        const view = waitlistView({
            capacity: division.registration_capacity,
            approvedCount: (approvedByDivision.get(division.id) || []).length,
            pending: submittedByDivision.get(division.id) || [],
        });
        for (const row of view.rows) if (row.isWaitlist) waitlistPosition.set(row.id, row.position);
    }

    const now = Date.now();
    const registrations = regs.map((reg) => {
        const division = divisionById.get(reg.division_id) || {};
        const tournament = tournamentById.get(division.tournament_id) || {};
        const seats = (membersByReg.get(reg.id) || []).slice().sort((a, b) => a.seat - b.seat);
        const locked = isRegistrationLocked(tournament.status);
        const linkActive = !!reg.partner_link_expires_at && Date.parse(reg.partner_link_expires_at) > now;
        return {
            id: reg.id,
            version: reg.version,
            status: reg.status,
            isOwner: reg.player_account_id === accountId,
            state: communityRegistrationState({ status: reg.status, waitlistPosition: waitlistPosition.get(reg.id) || null }),
            fee: feeState({ entryFee: division.entry_fee, feeConfirmedAt: reg.fee_confirmed_at }),
            locked,
            canWithdraw: !locked && ACTIVE_STATUSES.includes(reg.status),
            canInvite: !locked && reg.status === 'awaiting_partner' && reg.player_account_id === accountId,
            seatNames: seats.map((seat) => seat.full_name),
            partnerName: seats.find((seat) => seat.player_account_id !== accountId)?.full_name || null,
            linkActive,
            linkExpiresAt: linkActive ? reg.partner_link_expires_at : null,
            pendingInvites: (outCount.get(reg.id) || []).length,
            division: {
                id: division.id, name: division.name, entrantType: division.entrant_type,
                genderMode: division.gender_mode, entryFee: division.entry_fee,
            },
            tournament: {
                id: tournament.id, name: tournament.name, slug: tournament.public_slug,
                eventDate: tournament.event_date, location: tournament.location, status: tournament.status,
            },
        };
    });

    return { registrations, invitesIn: await loadInvitesIn(accountId, regIds) };
}

// Lời mời đến: gửi tới tài khoản (theo SĐT) hoặc tới một đơn lẻ của mình; bỏ lời mời do chính mình gửi.
async function loadInvitesIn(accountId, regIds) {
    const columns = 'id, division_id, from_registration_id, created_at';
    const [inviteByAccount, inviteByReg] = await Promise.all([
        selectRows(supabaseAdmin.from('tournament_pair_invites').select(columns).eq('status', 'pending').eq('invited_player_account_id', accountId)),
        regIds.length
            ? selectRows(supabaseAdmin.from('tournament_pair_invites').select(columns).eq('status', 'pending').in('to_registration_id', regIds))
            : Promise.resolve([]),
    ]);
    const invites = [...new Map([...inviteByAccount, ...inviteByReg].map((invite) => [invite.id, invite])).values()]
        .filter((invite) => !regIds.includes(invite.from_registration_id));
    return describeInvites(invites);
}

async function describeInvites(invites) {
    if (!invites.length) return [];
    const fromIds = unique(invites.map((invite) => invite.from_registration_id));
    const divisionIds = unique(invites.map((invite) => invite.division_id));
    const [fromMembers, divisions] = await Promise.all([
        selectRows(supabaseAdmin.from('tournament_registration_members').select('registration_id, seat, full_name, gender, self_declared_phr').in('registration_id', fromIds).eq('seat', 1)),
        selectRows(supabaseAdmin.from('tournament_divisions').select('id, tournament_id, name, gender_mode, rating_cap').in('id', divisionIds)),
    ]);
    const tournaments = await selectRows(supabaseAdmin.from('tournaments').select('id, name').in('id', unique(divisions.map((division) => division.tournament_id))));
    const memberByReg = new Map(fromMembers.map((member) => [member.registration_id, member]));
    const divisionById = new Map(divisions.map((division) => [division.id, division]));
    const tournamentById = new Map(tournaments.map((tournament) => [tournament.id, tournament]));
    return invites.map((invite) => {
        const member = memberByReg.get(invite.from_registration_id) || {};
        const division = divisionById.get(invite.division_id) || {};
        return {
            id: invite.id,
            createdAt: invite.created_at,
            fromName: member.full_name || 'VĐV',
            fromGender: division.gender_mode === 'mixed' ? member.gender || null : null,
            fromPhr: division.rating_cap != null && member.self_declared_phr != null ? Number(member.self_declared_phr) : null,
            divisionName: division.name || '',
            tournamentName: tournamentById.get(division.tournament_id)?.name || '',
        };
    });
}

// ===== Bảng tìm bạn ghép (PLC-05): chỉ cho VĐV có đơn lẻ trong nội dung, chỉ tên hiển thị (+ giới tính / PHR khi cần) =====
export async function loadPartnerBoard(accountId, divisionId) {
    const mine = await selectRows(supabaseAdmin.from('tournament_registrations')
        .select('id').eq('division_id', divisionId).eq('status', 'awaiting_partner').eq('player_account_id', accountId));
    if (!mine.length) return null;
    const [division] = await selectRows(supabaseAdmin.from('tournament_divisions').select('id, gender_mode, rating_cap').eq('id', divisionId));
    if (!division) return null;
    const others = await selectRows(supabaseAdmin.from('tournament_registrations')
        .select('id').eq('division_id', divisionId).eq('status', 'awaiting_partner').not('player_account_id', 'is', null).neq('id', mine[0].id));
    if (!others.length) return [];
    const seats = await selectRows(supabaseAdmin.from('tournament_registration_members')
        .select('registration_id, full_name, gender, self_declared_phr').in('registration_id', others.map((row) => row.id)).eq('seat', 1));
    return seats.map((seat) => ({
        registrationId: seat.registration_id,
        displayName: seat.full_name,
        gender: division.gender_mode === 'mixed' ? seat.gender || null : null,
        selfDeclaredPhr: division.rating_cap != null && seat.self_declared_phr != null ? Number(seat.self_declared_phr) : null,
    }));
}

// ===== Trang giải công khai (PLC-07): chỉ tên cặp đã duyệt + bộ đếm =====
export async function loadPublicCommunityTournament(slug) {
    const [tournament] = await selectRows(supabaseAdmin.from('tournaments')
        .select('id, name, location, event_date, public_slug, status, organizer_type, settings, visibility')
        .eq('public_slug', slug).eq('organizer_type', 'community').in('visibility', ['unlisted', 'public']));
    if (!tournament) return null;
    const divisions = await selectRows(supabaseAdmin.from('tournament_divisions')
        .select('id, name, entrant_type, gender_mode, entry_fee, registration_open, registration_capacity, registration_deadline, allow_late_registration, rating_cap, age_min, age_max')
        .eq('tournament_id', tournament.id).order('id'));
    const divisionIds = divisions.map((division) => division.id);
    const approved = divisionIds.length
        ? await selectRows(supabaseAdmin.from('tournament_registrations').select('id, division_id, status, admitted_at').in('division_id', divisionIds).eq('status', 'approved'))
        : [];
    const members = approved.length
        ? await selectRows(supabaseAdmin.from('tournament_registration_members').select('registration_id, seat, full_name').in('registration_id', approved.map((row) => row.id)))
        : [];
    const membersByReg = groupBy(members, 'registration_id');
    const approvedByDivision = groupBy(approved, 'division_id');
    const tournamentView = {
        organizer_mode: 'community',
        open_registration: tournament.settings?.open_registration === true,
    };
    const nowIso = new Date().toISOString();
    const payload = {
        tournament: {
            name: tournament.name, location: tournament.location, eventDate: tournament.event_date,
            startTime: tournament.settings?.start_time || null,
            slug: tournament.public_slug, status: tournament.status, locked: isRegistrationLocked(tournament.status),
        },
        divisions: divisions.map((division) => {
            const rows = (approvedByDivision.get(division.id) || []).map((row) => ({ ...row, members: membersByReg.get(row.id) || [] }));
            const open = isRegistrationOpen(tournamentView, division, nowIso);
            return {
                id: division.id,
                name: division.name,
                entrantType: division.entrant_type,
                genderMode: division.gender_mode,
                entryFee: division.entry_fee,
                deadline: division.registration_deadline,
                open: { ok: open.ok && !isRegistrationLocked(tournament.status), reason: open.ok ? null : open.reason },
                summary: publicSummary({ approvedCount: rows.length, capacity: division.registration_capacity }),
                pairs: projectPublicPairs(rows),
            };
        }),
    };
    assertNoForbiddenKeys(payload);
    return payload;
}
