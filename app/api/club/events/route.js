import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase, requireGroupAdmin } from '@/lib/groupSession';

const EVENT_SELECT = `
    *,
    fund_event_participants (
        id,
        member_id,
        has_paid,
        paid_at,
        notes,
        club_members ( id, full_name, is_active )
    )
`;

export async function GET() {
    const groupId = getGroupIdForDatabase();
    const { data, error } = await supabaseAdmin
        .from('fund_events')
        .select(EVENT_SELECT)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ events: data || [] });
}

export async function POST(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const groupId = adminCheck.groupId;

    const body = await request.json();
    const title = String(body?.title || '').trim();
    if (!title) {
        return NextResponse.json({ error: 'Tên sự kiện là bắt buộc.' }, { status: 400 });
    }
    const memberIds = Array.isArray(body?.memberIds) ? body.memberIds : [];

    const { data: event, error } = await supabaseAdmin
        .from('fund_events')
        .insert({
            group_id: groupId,
            title,
            description: (body?.description || '').trim() || null,
            amount_per_person: parseFloat(body?.amount_per_person) || 0,
            event_date: body?.event_date || null,
        })
        .select()
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (memberIds.length > 0) {
        const rows = memberIds.map((memberId) => ({
            event_id: event.id,
            member_id: memberId,
            has_paid: false,
        }));
        const { error: partErr } = await supabaseAdmin
            .from('fund_event_participants')
            .insert(rows);
        if (partErr) {
            return NextResponse.json({ error: partErr.message }, { status: 500 });
        }
    }
    return NextResponse.json({ event });
}

export async function DELETE(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const groupId = adminCheck.groupId;

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('id');
    if (!eventId) {
        return NextResponse.json({ error: 'Thiếu id sự kiện.' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
        .from('fund_events')
        .delete()
        .eq('id', eventId)
        .eq('group_id', groupId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
