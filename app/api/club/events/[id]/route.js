import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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

export async function GET(request, { params }) {
    const { id } = params;
    if (!id) {
        return NextResponse.json({ error: 'Thiếu id sự kiện.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from('fund_events')
        .select(EVENT_SELECT)
        .eq('id', id)
        .single();

    if (error || !data) {
        return NextResponse.json(
            { error: 'Không tìm thấy sự kiện.' },
            { status: 404 }
        );
    }

    return NextResponse.json({ event: data });
}
