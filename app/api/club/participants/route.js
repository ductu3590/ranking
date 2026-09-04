import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';

// Toggle a participant's paid status. Body: { participantId, hasPaid }.
export async function PATCH(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const groupId = adminCheck.groupId;

    const body = await request.json();
    const participantId = body?.participantId;
    const hasPaid = Boolean(body?.hasPaid);
    if (!participantId) {
        return NextResponse.json({ error: 'Thiếu participantId.' }, { status: 400 });
    }

    // Confirm the participant's event belongs to this group before updating.
    const { data: participant } = await supabaseAdmin
        .from('fund_event_participants')
        .select('id, fund_events!inner ( group_id )')
        .eq('id', participantId)
        .single();
    if (!participant || participant.fund_events?.group_id !== groupId) {
        return NextResponse.json({ error: 'Không tìm thấy.' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
        .from('fund_event_participants')
        .update({ has_paid: hasPaid, paid_at: hasPaid ? new Date().toISOString() : null })
        .eq('id', participantId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
