import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { buildCommunityContext } from '@/lib/tournament/communitySetup';

// Phần I/O của setup giải cộng đồng (Epic 4 C3). Chỉ đọc; quyết định nghiệp vụ nằm ở lib/tournament/communitySetup.js.
// Giải CLB / giao hữu không đi qua đây: mọi hàm trả null / không cấp quyền khi tournaments.organizer_type <> 'community'.

const db = supabaseAdmin || supabaseServer;

function positiveId(value) {
    const text = String(value ?? '');
    return /^[1-9][0-9]{0,15}$/.test(text) ? Number(text) : null;
}

async function selectRows(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// Actor được thao tác setup của giải cộng đồng bằng platform_session. Trả null nếu KHÔNG phải (phiên CLB, giải CLB,
// không đăng nhập, sai vai trò) → route giữ nguyên câu trả lời từ chối của requireValidatedGroupAdmin.
// Trả cùng shape với requireValidatedGroupAdmin ({ ok, groupId, actor }) để phần còn lại của route không phải đổi.
export async function communitySetupAdmin(tournamentId) {
    const id = positiveId(tournamentId);
    if (!id) return null;
    const access = await requireTournamentAccess({ tournamentId: id, need: 'write' });
    if (!access.ok) return null;
    if (access.actorKind !== 'platform' || access.tournament?.organizer_type !== 'community') return null;
    return { ok: true, groupId: access.groupId, actor: access.actor, actorKind: 'platform', community: true, tournament: access.tournament };
}

// Cùng cổng với communitySetupAdmin nhưng suy giải từ mã trận (route ghi tỉ số nhận matchId, không nhận tournamentId).
export async function communityScoreAdmin(matchId) {
    const id = positiveId(matchId);
    if (!id) return null;
    const { data: match, error } = await db.from('tournament_matches').select('id, division_id').eq('id', id).maybeSingle();
    if (error || !match?.division_id) return null;
    const access = await requireTournamentAccess({ divisionId: match.division_id, need: 'write' });
    if (!access.ok) return null;
    if (access.actorKind !== 'platform' || access.tournament?.organizer_type !== 'community') return null;
    return { ok: true, groupId: access.groupId, actor: access.actor, actorKind: 'platform', community: true, tournament: access.tournament };
}

// Quyền ĐỌC của admin hệ thống cho route đọc chỉ có đường phiên CLB (BXH, …): suy giải từ stage. null nếu không phải platform actor / giải CLB.
export async function communityReadScope({ stageId }) {
    const id = positiveId(stageId);
    if (!id) return null;
    const access = await requireTournamentAccess({ stageId: id, need: 'read' });
    if (!access.ok || access.actorKind !== 'platform' || access.tournament?.organizer_type !== 'community') return null;
    return { ok: true, groupId: access.groupId };
}

// ctx.community của một nội dung (null nếu giải không phải cộng đồng). Chỉ I/O; shape do buildCommunityContext quyết định.
export async function loadCommunitySetup({ groupId, tournamentId, divisionId }) {
    const gid = positiveId(groupId);
    const tid = positiveId(tournamentId);
    const did = positiveId(divisionId);
    if (!gid || !tid || !did) return null;
    const [tournament] = await selectRows(db.from('tournaments')
        .select('id, group_id, organizer_type, name, event_date, location, description, settings').eq('id', tid).eq('group_id', gid));
    if (!tournament || tournament.organizer_type !== 'community') return null;
    const [division] = await selectRows(db.from('tournament_divisions').select('id, entry_fee').eq('id', did).eq('tournament_id', tid).eq('group_id', gid));
    if (!division) return null;
    const registrations = await selectRows(db.from('tournament_registrations')
        .select('id, status, merged_into, player_account_id, fee_confirmed_at')
        .eq('division_id', did).eq('group_id', gid).not('player_account_id', 'is', null).order('id'));
    const approvedIds = registrations.filter((row) => row.status === 'approved' && row.merged_into == null).map((row) => row.id);
    const members = approvedIds.length
        ? await selectRows(db.from('tournament_registration_members')
            .select('registration_id, seat, player_account_id, full_name, self_declared_phr').in('registration_id', approvedIds).order('seat'))
        : [];
    const byRegistration = new Map();
    for (const member of members) {
        if (!byRegistration.has(member.registration_id)) byRegistration.set(member.registration_id, []);
        byRegistration.get(member.registration_id).push(member);
    }
    const context = buildCommunityContext({
        registrations: registrations.map((row) => ({ ...row, members: byRegistration.get(row.id) || [] })),
        entryFee: division.entry_fee,
    });
    // `meta`: thông tin giải để điền sẵn Bước 1 (chỉ dùng phía server; projectCommunityView không trả ra ngoài).
    return {
        ...context,
        meta: {
            name: tournament.name || '',
            eventDate: tournament.event_date || '',
            location: tournament.location || '',
            description: tournament.description || '',
            startTime: tournament.settings?.start_time || '',
            courtCount: Number.isInteger(Number(tournament.settings?.court_count)) ? Number(tournament.settings.court_count) : null,
        },
    };
}
