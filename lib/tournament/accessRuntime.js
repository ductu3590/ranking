// Cầu nối giữa tầng route (Next + Supabase) và chính sách quyền thuần trong
// `lib/tournament/access.js`.
//
// Route KHÔNG tự quyết quyền: nó gọi `requireTournamentAccess()`, nhận về
// `{ groupId, canReadPrivate }` rồi mới truy vấn. Nhờ vậy giải cộng đồng
// (platform_session) và giải CLB (group_session) đi cùng một đường, và không
// route nào còn hard-code `requireValidatedGroupAdmin()` + `.eq('group_id')`
// như một cách suy ra quyền sở hữu.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';
import { getValidatedPlatformSessionFromCookies } from '@/lib/platformSession';
import { getAthleteClubContext } from '@/lib/clubReadContext';
import { resolveTournamentAccess, resolveParticipantClubAccess } from '@/lib/tournament/access';
import { GUEST_CLUB_FIELDS, GUEST_TOURNAMENT_FIELDS, positiveId } from '@/lib/tournament/friendlyServer';
export { projectRegistration, projectRegistrations } from '@/lib/tournament/access';

const db = supabaseAdmin || supabaseServer;

// Đủ để `access.js` quyết định: tenant + đơn vị tổ chức.
const TOURNAMENT_ACCESS_FIELDS = 'id, group_id, organizer_type, organizer_club_id, organizer_community_id, visibility';

function denyResponse(decision) {
    return NextResponse.json(
        { error: decision.message, code: decision.code },
        { status: decision.status },
    );
}

// platform_session được ưu tiên vì đó là phiên "rộng" hơn; nếu không có mới
// xét group_session. Không bao giờ trộn hai phiên thành một actor.
export async function resolveActorFromCookies() {
    const platformSession = await getValidatedPlatformSessionFromCookies();
    if (platformSession) {
        return {
            kind: 'platform',
            role: platformSession.role || null,
            accountId: platformSession.account_id ?? null,
            session: platformSession,
        };
    }
    const groupSession = await getValidatedGroupSessionFromCookies();
    if (groupSession) {
        return {
            kind: 'group',
            role: groupSession.role || null,
            groupId: groupSession.group_id,
            session: groupSession,
        };
    }
    // VĐV đăng nhập bằng tài khoản cá nhân là actor 'group' với role 'athlete'.
    // Không cần đụng access.js: resolveTournamentWrite đã từ chối mọi role khác
    // 'admin', còn resolveTournamentRead cho đọc khi cùng group_id với giải —
    // đúng nghĩa "xem giải của CLB mình, không sửa được gì".
    const athleteContext = await getAthleteClubContext();
    if (athleteContext) {
        return {
            kind: 'group',
            role: athleteContext.role,
            groupId: athleteContext.group_id,
            session: athleteContext,
        };
    }
    return null;
}

async function loadTournamentRow(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || null;
}

export function loadTournamentById(tournamentId) {
    return loadTournamentRow(
        db.from('tournaments').select(TOURNAMENT_ACCESS_FIELDS).eq('id', tournamentId).maybeSingle(),
    );
}

// Các route con nhận `divisionId`/`stageId` chứ không nhận `tournamentId`.
// Quyền vẫn phải quy về bản ghi giải, nên phải đi ngược lên một bậc.
export async function loadTournamentByDivisionId(divisionId) {
    const division = await loadTournamentRow(
        db.from('tournament_divisions').select('id, tournament_id').eq('id', divisionId).maybeSingle(),
    );
    if (!division) return { tournament: null, division: null };
    const tournament = await loadTournamentById(division.tournament_id);
    return { tournament, division };
}

export async function loadTournamentByStageId(stageId) {
    const stage = await loadTournamentRow(
        db.from('tournament_stages').select('id, tournament_id, division_id, status, config').eq('id', stageId).maybeSingle(),
    );
    if (!stage) return { tournament: null, stage: null };
    const tournament = await loadTournamentById(stage.tournament_id);
    return { tournament, stage };
}

export async function loadTournamentByClubRowId(tournamentClubId) {
    const row = await loadTournamentRow(
        db.from('tournament_clubs').select('id, tournament_id').eq('id', tournamentClubId).maybeSingle(),
    );
    if (!row) return { tournament: null, tournamentClub: null };
    const tournament = await loadTournamentById(row.tournament_id);
    return { tournament, tournamentClub: row };
}

/**
 * Gác quyền cho một giải cụ thể.
 *
 * @param {object} options
 * @param {string|number} [options.tournamentId]
 * @param {string|number} [options.divisionId] Suy ra giải từ division.
 * @param {string|number} [options.stageId]    Suy ra giải từ stage.
 * @param {'read'|'write'} [options.need]
 * @returns {Promise<{ok: true, groupId: number, canReadPrivate: boolean, actorKind: string,
 *                     actor: object, tournament: object, division?: object, stage?: object}
 *                   |{ok: false, response: import('next/server').NextResponse}>}
 */
export async function requireTournamentAccess({ tournamentId, divisionId, stageId, need = 'write' } = {}) {
    const actor = await resolveActorFromCookies();

    let tournament = null;
    let division;
    let stage;
    if (tournamentId != null) {
        tournament = await loadTournamentById(tournamentId);
    } else if (divisionId != null) {
        ({ tournament, division } = await loadTournamentByDivisionId(divisionId));
    } else if (stageId != null) {
        ({ tournament, stage } = await loadTournamentByStageId(stageId));
    } else {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Thiếu tournamentId/divisionId/stageId để xác định giải.', code: 'TOURNAMENT_REF_REQUIRED' },
                { status: 400 },
            ),
        };
    }

    const decision = resolveTournamentAccess({ tournament, actor, need });
    if (!decision.allowed) return { ok: false, response: denyResponse(decision) };

    return {
        ok: true,
        groupId: decision.groupId,
        canReadPrivate: decision.canReadPrivate,
        actorKind: decision.actorKind,
        actor,
        tournament,
        division,
        stage,
    };
}

// --- Quyền "CLB tham dự" của giải giao hữu (spec Epic 3 F1 §4, README §6) -----------------------------------------
// Admin CLB khách được mời đọc/ghi DÒNG tournament_clubs của chính mình — không phải quyền trên giải. Chủ nhà đi
// requireTournamentAccess. Phiên lấy từ group_session đã xác thực (vé VĐV / phiên cộng đồng không tính): "CLB tham dự"
// luôn là một CLB, và phiên platform không được che mất phiên CLB.

// Cột quyền (access.js) + cột hiển thị lời mời, không trùng tên cột.
const PARTICIPANT_TOURNAMENT_FIELDS = [...new Set(`${TOURNAMENT_ACCESS_FIELDS}, ${GUEST_TOURNAMENT_FIELDS}`.split(',').map((field) => field.trim()))].join(', ');

// Lọc club_id NGAY TRONG truy vấn: không có đường đọc dòng của CLB khác rồi mới so.
export async function loadParticipantClubRow({ tournamentClubId, clubGroupId }) {
    return loadTournamentRow(
        db.from('tournament_clubs').select(GUEST_CLUB_FIELDS).eq('id', tournamentClubId).eq('club_id', clubGroupId).maybeSingle(),
    );
}

/**
 * @returns {Promise<{ok: true, groupId: number, clubGroupId: number, tournamentClubId: number, actorKind: 'participant_club',
 *                     session: object, row: object, tournament: object}
 *                   |{ok: false, response: import('next/server').NextResponse}>}
 */
export async function requireParticipantClubAccess({ tournamentClubId }) {
    const session = await getValidatedGroupSessionFromCookies();
    const actor = session ? { kind: 'group', role: session.role || null, groupId: session.group_id } : null;
    const id = positiveId(typeof tournamentClubId === 'string' ? tournamentClubId : Number(tournamentClubId));
    let row = null;
    let tournament = null;
    if (actor && id) {
        row = await loadParticipantClubRow({ tournamentClubId: id, clubGroupId: Number(actor.groupId) });
        if (row) {
            tournament = await loadTournamentRow(
                db.from('tournaments').select(PARTICIPANT_TOURNAMENT_FIELDS)
                    .eq('id', row.tournament_id).eq('group_id', row.group_id).maybeSingle(),
            );
        }
    }
    const decision = resolveParticipantClubAccess({ tournament, tournamentClub: row, actor });
    if (!decision.allowed) return { ok: false, response: denyResponse(decision) };
    return {
        ok: true,
        groupId: decision.groupId,
        clubGroupId: decision.clubGroupId,
        tournamentClubId: decision.tournamentClubId,
        actorKind: decision.actorKind,
        session,
        row,
        tournament,
    };
}

export { TOURNAMENT_ACCESS_FIELDS };
