import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase } from '@/lib/groupSession';

export async function GET() {
    const groupId = getGroupIdForDatabase();
    const { data: events, error } = await supabaseAdmin
        .from('fund_events')
        .select('*')
        .eq('group_id', groupId)
        .order('event_date', { ascending: false });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const eventIds = (events || []).map((e) => e.id);
    let participants = [];
    if (eventIds.length > 0) {
        const { data: parts, error: pErr } = await supabaseAdmin
            .from('fund_event_participants')
            .select('*')
            .in('event_id', eventIds);
        if (pErr) {
            return NextResponse.json({ error: pErr.message }, { status: 500 });
        }
        participants = parts || [];
    }
    return NextResponse.json({ events: events || [], participants });
}
