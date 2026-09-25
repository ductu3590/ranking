// Chi tiết + hành động của CLB KHÁCH trên lời mời của chính mình (spec Epic 3 F1 §6.2).
//   GET  → { invitation: GuestInvitationView, members: [{ memberId, name, active, hasAthlete }] }
//   POST { action, expected_version, roster? } → { invitation }
//        action ∈ accept | decline | save_roster | submit_roster | unsubmit | withdraw
// Quyền "CLB tham dự" (requireParticipantClubAccess): truy vấn lọc club_id = CLB của phiên; không lộ giải tồn tại.
// Phía ('guest') và actor do server đặt; body không mang side / club_id / group_id / hạn mức.
// submit_roster gửi BẢN ĐANG SOẠN đã lưu (roster_draft) — muốn gửi thay đổi mới thì save_roster trước.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireParticipantClubAccess, loadParticipantClubRow } from '@/lib/tournament/accessRuntime';
import { normalizeClubRoster } from '@/lib/tournament/setupDraftV3';
import { validateClubRosterForSave, validateClubRosterForSubmit } from '@/lib/tournament/friendlyClubs';
import { loadMemberContext } from '@/lib/tournament/setupServer';
import {
    GUEST_ACTIONS,
    positiveId,
    friendlyErrorPayload,
    rpcErrorPayload,
    blockerPayload,
    guestInvitationView,
    loadFriendlyDivisions,
    loadGroupNames,
    loadClubMembers,
} from '@/lib/tournament/friendlyServer';

const db = supabaseAdmin || supabaseServer;

function reply({ status, body }) {
    return NextResponse.json(body, { status });
}

// Dựng GuestInvitationView từ dòng + giải đã nạp qua quyền (không truy vấn lại theo id tự do).
async function buildView(row, tournament) {
    const [divisions, hosts] = await Promise.all([
        loadFriendlyDivisions(db, [row.tournament_id]),
        loadGroupNames(db, [row.group_id], { withLogo: true }),
    ]);
    const division = divisions.get(String(row.tournament_id));
    const host = hosts.get(String(row.group_id));
    return guestInvitationView({
        row,
        tournament,
        hostClub: { name: host?.name ?? null, logoUrl: host?.logo_url ?? null },
        division: division && String(division.group_id) === String(row.group_id) ? division : null,
        now: new Date(),
    });
}

export async function GET(_request, { params }) {
    try {
        const access = await requireParticipantClubAccess({ tournamentClubId: params?.id });
        if (!access.ok) return access.response;
        const [invitation, members] = await Promise.all([
            buildView(access.row, access.tournament),
            loadClubMembers(db, access.clubGroupId),
        ]);
        return NextResponse.json({ invitation, members });
    } catch (error) {
        console.error('Friendly invitation GET error:', error);
        return NextResponse.json({ error: 'Không tải được lời mời.', code: 'FRIENDLY_READ_FAILED' }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(friendlyErrorPayload('SETUP_PAYLOAD_INVALID'));
        const action = typeof body.action === 'string' ? body.action : '';
        const expectedVersion = positiveId(body.expected_version);
        if (!GUEST_ACTIONS.includes(action) || !expectedVersion) return reply(friendlyErrorPayload('SETUP_PAYLOAD_INVALID'));

        const access = await requireParticipantClubAccess({ tournamentClubId: params?.id });
        if (!access.ok) return access.response;

        let payload = {};
        if (action === 'save_roster') {
            // Chặn rõ khách mời (D38) và shape sai trước khi normalize lặng lẽ bỏ chúng.
            const checked = validateClubRosterForSave(body.roster);
            if (!checked.ok) return reply(blockerPayload(checked.blockers));
            payload = { roster: normalizeClubRoster(body.roster) };
        } else if (action === 'submit_roster' && ['accepted', 'changes_requested'].includes(access.row.invitation_status)) {
            // Báo blocker rõ (tên người thiếu hồ sơ…) trước khi gọi RPC; RPC vẫn kiểm lại dưới khoá.
            const draft = normalizeClubRoster(access.row.roster_draft);
            const members = await loadMemberContext(db, access.clubGroupId, draft.memberIds);
            const checked = validateClubRosterForSubmit(access.row.roster_draft, { quota: access.row.quota, members });
            if (!checked.ok) return reply(blockerPayload(checked.blockers));
        }

        const { error } = await db.rpc('friendly_club_action', {
            p_actor_group_id: Number(access.clubGroupId),
            p_side: 'guest',
            p_tournament_club_id: Number(access.tournamentClubId),
            p_action: action,
            p_expected_version: expectedVersion,
            p_payload: payload,
        });
        if (error) {
            const response = rpcErrorPayload(error);
            if (response.status >= 500) console.error('friendly_club_action (guest) error:', error);
            return reply(response);
        }
        // Đọc lại đúng cột của phía khách (RPC trả cả cột chủ nhà), vẫn lọc club_id trong truy vấn.
        const row = await loadParticipantClubRow({ tournamentClubId: Number(access.tournamentClubId), clubGroupId: Number(access.clubGroupId) });
        if (!row) return reply(friendlyErrorPayload('FRIENDLY_CLUB_NOT_FOUND'));
        return NextResponse.json({ invitation: await buildView(row, access.tournament) });
    } catch (error) {
        console.error('Friendly invitation POST error:', error);
        return NextResponse.json({ error: 'Không cập nhật được lời mời. Thử lại sau.', code: 'FRIENDLY_MUTATION_FAILED' }, { status: 500 });
    }
}
