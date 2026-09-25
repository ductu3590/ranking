import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { normalizeName } from '@/lib/fundLeaderboard';
import { loadContributionInputs } from '@/lib/fundContributions';
import {
    isFriendlyNotificationKind,
    projectClubNotification,
    shouldResolveNotification,
    FRIENDLY_NOTIFICATION_KINDS,
} from '@/lib/tournament/friendlyNotifications';

// Thông báo giải giao hữu (spec Epic 3 F1 §6.4): thông báo đang mở mà dòng tournament_clubs không còn (giải bị xoá)
// hoặc trạng thái không còn đòi mở → đánh dấu resolved và bỏ khỏi kết quả. Dòng phải thuộc đúng CLB của phiên
// (khách: club_id; chủ nhà: group_id) — không khớp coi như mồ côi. Kind khác không đụng.
async function settleFriendlyNotifications(groupId, rows) {
    const friendly = rows.filter((row) => isFriendlyNotificationKind(row.kind));
    if (!friendly.length) return rows;
    const subjectIds = [...new Set(friendly.map((row) => Number(row.subject_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    let subjects = new Map();
    if (subjectIds.length) {
        const { data, error } = await supabaseAdmin
            .from('tournament_clubs')
            .select('id, group_id, club_id, invitation_status')
            .in('id', subjectIds);
        if (error) throw error;
        subjects = new Map((data || []).map((row) => [String(row.id), row]));
    }
    const stale = new Set();
    for (const notification of friendly) {
        const subject = subjects.get(String(notification.subject_id)) || null;
        const owner = notification.kind === FRIENDLY_NOTIFICATION_KINDS.guest ? subject?.club_id : subject?.group_id;
        const scoped = subject && String(owner) === String(groupId) ? subject : null;
        if (shouldResolveNotification(notification, scoped)) stale.add(notification.id);
    }
    if (stale.size) {
        const { error } = await supabaseAdmin
            .from('club_notifications')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('group_id', groupId)
            .eq('status', 'open')
            .in('id', [...stale]);
        if (error) throw error;
    }
    return rows.filter((row) => !stale.has(row.id));
}

export async function GET() {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const groupId = adminCheck.groupId;

    try {
        const { transactions, members } = await loadContributionInputs(supabaseAdmin, groupId);
        const roster = new Set(members.map((member) => normalizeName(member.full_name)));
        const unassigned = transactions.filter((transaction) => {
            if (transaction.huong_giao_dich !== 'in' || !(Number(transaction.so_tien) > 0)) return false;
            const key = normalizeName(transaction.nguoi_nop);
            if (key === 'THỦ QUỸ') return false;
            return !roster.has(key);
        });

        const { data: existing, error: existingError } = await supabaseAdmin
            .from('club_notifications')
            .select('*')
            .eq('group_id', groupId)
            .eq('kind', 'unassigned_transaction');
        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

        const known = new Map((existing || []).map((row) => [Number(row.subject_id), row]));
        const missing = unassigned
            .filter((transaction) => !known.has(Number(transaction.id)))
            .map((transaction) => ({
                group_id: groupId,
                kind: 'unassigned_transaction',
                subject_type: 'quy_pickleball',
                subject_id: transaction.id,
                payload: {
                    so_tien: transaction.so_tien,
                    noi_dung_goc: transaction.noi_dung_goc,
                    ma_giao_dich: transaction.ma_giao_dich,
                    created_at: transaction.created_at,
                },
            }));
        if (missing.length > 0) {
            const { error } = await supabaseAdmin.from('club_notifications').upsert(missing, {
                onConflict: 'group_id,kind,subject_type,subject_id', ignoreDuplicates: true,
            });
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const unassignedIds = new Set(unassigned.map((transaction) => Number(transaction.id)));
        const toResolve = (existing || [])
            .filter((row) => row.status === 'open' && !unassignedIds.has(Number(row.subject_id)))
            .map((row) => row.id);
        if (toResolve.length > 0) {
            await supabaseAdmin
                .from('club_notifications')
                .update({ status: 'resolved', resolved_at: new Date().toISOString() })
                .eq('group_id', groupId)
                .in('id', toResolve);
        }

        const { data: fresh, error } = await supabaseAdmin
            .from('club_notifications')
            .select('*')
            .eq('group_id', groupId)
            .eq('status', 'open')
            .order('created_at', { ascending: false });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const open = await settleFriendlyNotifications(groupId, fresh || []);
        const notifications = open.map(projectClubNotification);
        return NextResponse.json({ notifications, openCount: notifications.length });
    } catch (error) {
        console.error('Không tải được thông báo CLB:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const body = await request.json();
    const id = Number(body?.id);
    const status = body?.status;
    if (!Number.isInteger(id) || !['dismissed', 'resolved'].includes(status)) {
        return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
        .from('club_notifications')
        .update({ status, resolved_at: new Date().toISOString() })
        .eq('id', id)
        .eq('group_id', adminCheck.groupId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}