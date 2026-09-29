import { supabaseAdmin } from './supabaseAdmin';
import { requirePlatformAdmin } from './platformSession';
import { communityRegistrationState, feeState, isRegistrationLocked, nextAdminActions } from './tournament/communityRegistration';
import { waitlistView } from './tournament/openRegistration';

// Phần I/O phía admin hệ thống của lát C2 (Epic 4). Chỉ đọc phiên platform_session — không đụng phiên VĐV/CLB.
// Admin thấy SĐT VĐV (chỉ trong bảng duyệt, D57); mọi route admin đều qua requireCommunityAdmin.

export async function requireCommunityAdmin() {
    const check = await requirePlatformAdmin();
    if (!check.ok) return check;
    const accountId = Number(check.session?.account_id);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) return { ok: false, response: check.response };
    return { ok: true, accountId, role: check.session.role, session: check.session };
}

function unique(values) {
    return [...new Set(values.filter((value) => value != null))];
}

async function selectRows(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// Giải cộng đồng + các nội dung của nó cho trang dựng giải (C3). null nếu không có giải hoặc giải không phải cộng đồng.
export async function loadCommunitySetupTarget(tournamentId) {
    const id = Number(tournamentId);
    if (!supabaseAdmin || !Number.isSafeInteger(id) || id <= 0) return null;
    const [tournament] = await selectRows(supabaseAdmin.from('tournaments')
        .select('id, name, organizer_type').eq('id', id).eq('organizer_type', 'community'));
    if (!tournament) return null;
    const divisions = await selectRows(supabaseAdmin.from('tournament_divisions')
        .select('id, name, roster_lock_status').eq('tournament_id', id).order('id'));
    return { tournament, divisions };
}

// Danh sách giải cộng đồng + nội dung + số cặp đã duyệt (PLA-03).
export async function listAdminCommunityTournaments() {
    const tournaments = await selectRows(supabaseAdmin.from('tournaments')
        .select('id, name, event_date, location, public_slug, status, settings, visibility, description')
        .eq('organizer_type', 'community').order('event_date', { ascending: false, nullsFirst: true }).order('id', { ascending: false }));
    if (!tournaments.length) return [];
    const divisions = await selectRows(supabaseAdmin.from('tournament_divisions')
        .select('id, tournament_id, name, entrant_type, play_type, gender_mode, rating_cap, registration_open, registration_capacity, registration_deadline, entry_fee')
        .in('tournament_id', tournaments.map((t) => t.id)).order('id'));
    const approved = divisions.length
        ? await selectRows(supabaseAdmin.from('tournament_registrations').select('id, division_id').in('division_id', divisions.map((d) => d.id)).eq('status', 'approved'))
        : [];
    const approvedByDivision = new Map();
    for (const row of approved) approvedByDivision.set(row.division_id, (approvedByDivision.get(row.division_id) || 0) + 1);
    return tournaments.map((t) => {
        const own = divisions.filter((d) => d.tournament_id === t.id).map((d) => ({ ...d, approved: approvedByDivision.get(d.id) || 0 }));
        const open = t.settings?.open_registration === true;
        return {
            id: t.id,
            name: t.name,
            eventDate: t.event_date,
            location: t.location,
            slug: t.public_slug,
            description: t.description,
            status: t.status,
            visibility: t.visibility,
            openRegistration: open,
            startTime: t.settings?.start_time || null,
            locked: isRegistrationLocked(t.status),
            phase: isRegistrationLocked(t.status) ? 'finalized' : open ? 'open' : t.status === 'draft' ? 'draft' : 'closed',
            approvedTotal: own.reduce((sum, d) => sum + d.approved, 0),
            capacityTotal: own.every((d) => d.registration_capacity != null) ? own.reduce((sum, d) => sum + d.registration_capacity, 0) : null,
            divisions: own,
        };
    });
}

// Bảng duyệt một nội dung (PLA-02): đơn + ghế (kèm SĐT) + trạng thái + phí + hành động + số liệu.
export async function loadAdminRegistrations(divisionId) {
    const [division] = await selectRows(supabaseAdmin.from('tournament_divisions')
        .select('id, tournament_id, name, entrant_type, gender_mode, entry_fee, registration_capacity, rating_cap').eq('id', divisionId));
    if (!division) return null;
    const [tournament] = await selectRows(supabaseAdmin.from('tournaments').select('id, name, status, organizer_type, public_slug').eq('id', division.tournament_id));
    if (!tournament || tournament.organizer_type !== 'community') return null;

    const regs = await selectRows(supabaseAdmin.from('tournament_registrations')
        .select('id, status, version, fee_confirmed_at, admitted_at, created_at, queue_seq, private_note')
        .eq('division_id', divisionId).not('player_account_id', 'is', null).neq('status', 'merged').order('created_at', { ascending: true }));
    const members = regs.length
        ? await selectRows(supabaseAdmin.from('tournament_registration_members')
            .select('registration_id, seat, full_name, phone_norm, self_declared_phr, gender, player_account_id').in('registration_id', regs.map((r) => r.id)))
        : [];
    const names = unique(members.map((m) => m.full_name));
    const sameName = names.length
        ? await selectRows(supabaseAdmin.from('player_accounts').select('id, display_name').in('display_name', names))
        : [];
    const accountsByName = new Map();
    for (const row of sameName) {
        const set = accountsByName.get(row.display_name) || new Set();
        set.add(row.id);
        accountsByName.set(row.display_name, set);
    }

    const membersByReg = new Map();
    for (const member of members) {
        const list = membersByReg.get(member.registration_id) || [];
        list.push(member);
        membersByReg.set(member.registration_id, list);
    }

    const approvedCount = regs.filter((reg) => reg.status === 'approved').length;
    const capacity = division.registration_capacity;
    const view = waitlistView({
        capacity,
        approvedCount,
        pending: regs.filter((reg) => reg.status === 'submitted'),
    });
    const waitlistById = new Map(view.rows.filter((row) => row.isWaitlist).map((row) => [row.id, row.position]));
    const capacityFull = capacity != null && approvedCount >= capacity;
    const hasFee = Number(division.entry_fee) > 0;

    const registrations = regs.map((reg) => {
        const seats = (membersByReg.get(reg.id) || []).slice().sort((a, b) => a.seat - b.seat).map((m) => ({
            seat: m.seat,
            name: m.full_name,
            phone: m.phone_norm,
            gender: m.gender,
            phr: m.self_declared_phr == null ? null : Number(m.self_declared_phr),
            duplicateName: (accountsByName.get(m.full_name)?.size || 0) > 1,
        }));
        return {
            id: reg.id,
            version: reg.version,
            status: reg.status,
            state: communityRegistrationState({ status: reg.status, waitlistPosition: waitlistById.get(reg.id) || null }),
            fee: feeState({ entryFee: division.entry_fee, feeConfirmedAt: reg.fee_confirmed_at }),
            waitlistPosition: waitlistById.get(reg.id) || null,
            createdAt: reg.created_at,
            admittedAt: reg.admitted_at,
            note: reg.private_note,
            seats,
            actions: nextAdminActions({ status: reg.status, hasFee, feeConfirmed: !!reg.fee_confirmed_at, capacityFull }),
        };
    });

    const count = (predicate) => registrations.filter(predicate).length;
    return {
        tournament: { id: tournament.id, name: tournament.name, status: tournament.status, slug: tournament.public_slug, locked: isRegistrationLocked(tournament.status) },
        division: { id: division.id, name: division.name, entrantType: division.entrant_type, genderMode: division.gender_mode, entryFee: division.entry_fee, capacity },
        counts: {
            approved: approvedCount,
            submitted: count((r) => r.status === 'submitted' && !r.waitlistPosition),
            waitlist: count((r) => !!r.waitlistPosition),
            awaitingPartner: count((r) => r.status === 'awaiting_partner'),
            unpaid: hasFee ? count((r) => ['submitted', 'approved'].includes(r.status) && r.fee.key === 'unpaid') : 0,
        },
        registrations,
    };
}
