import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

// Đơn vị được xếp lịch của Phase 3 là tournament_entries theo division.
// Bảng entrant cấp giải của v2 cũ không được dùng ở luồng này.
const SELECT_FIELDS = 'id, group_id, division_id, tournament_club_id, name_snapshot, color_snapshot, seed, status';

export async function GET(request) {
    try {
        const scope = getClubScope();
        if (!scope.ok) return scope.response;
        const { searchParams } = new URL(request.url);
        const divisionId = searchParams.get('divisionId');
        if (!divisionId) return NextResponse.json({ error: 'divisionId là bắt buộc' }, { status: 400 });

        const { data: entries, error } = await db
            .from('tournament_entries')
            .select(SELECT_FIELDS)
            .eq('group_id', scope.groupId)
            .eq('division_id', divisionId)
            .order('seed', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!entries || entries.length === 0) return NextResponse.json({ entries: [] });

        const { data: members, error: membersError } = await db
            .from('tournament_entry_members')
            .select('id, entry_id, athlete_id, display_name_snapshot, club_name_snapshot, skill_snapshot, roster_role')
            .eq('group_id', scope.groupId)
            .in('entry_id', entries.map((entry) => entry.id))
            .order('id', { ascending: true });
        if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });

        const byEntry = new Map();
        for (const member of members || []) {
            if (!byEntry.has(member.entry_id)) byEntry.set(member.entry_id, []);
            byEntry.get(member.entry_id).push(member);
        }
        return NextResponse.json({
            entries: entries.map((entry) => ({ ...entry, members: byEntry.get(entry.id) || [] })),
        });
    } catch (err) {
        console.error('Entries GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;
        const body = await request.json();
        const divisionId = body?.division_id;
        const name = String(body?.name || '').trim();
        if (!divisionId) return NextResponse.json({ error: 'division_id là bắt buộc' }, { status: 400 });
        if (!name) return NextResponse.json({ error: 'Tên suất thi đấu là bắt buộc' }, { status: 400 });
        if (!body?.tournament_club_id) return NextResponse.json({ error: 'tournament_club_id là bắt buộc' }, { status: 400 });

        const { data: division, error: divisionError } = await db
            .from('tournament_divisions')
            .select('id, tournament_id, play_type')
            .eq('id', divisionId)
            .eq('group_id', groupId)
            .maybeSingle();
        if (divisionError) throw divisionError;
        if (!division) return NextResponse.json({ error: 'Không tìm thấy nội dung thi đấu' }, { status: 404 });

        const members = Array.isArray(body.members) ? body.members : [];
        if (division.play_type === 'singles' && members.length > 1) {
            return NextResponse.json({ error: 'Nội dung đánh đơn chỉ có một VĐV mỗi suất', code: 'SINGLES_ENTRY_SIZE' }, { status: 400 });
        }

        const { data: entry, error } = await db
            .from('tournament_entries')
            .insert({
                group_id: groupId,
                division_id: divisionId,
                tournament_club_id: body.tournament_club_id,
                source_registration_id: body.source_registration_id || null,
                name_snapshot: name,
                color_snapshot: body.color || null,
                seed: body.seed == null || body.seed === '' ? null : Number(body.seed),
                status: 'approved',
            })
            .select(SELECT_FIELDS)
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        let insertedMembers = [];
        if (members.length) {
            const { data, error: membersError } = await db
                .from('tournament_entry_members')
                .insert(members.map((member) => ({
                    group_id: groupId,
                    entry_id: entry.id,
                    athlete_id: member.athlete_id ?? null,
                    display_name_snapshot: String(member.display_name || name).trim(),
                    club_name_snapshot: member.club_name || null,
                    skill_snapshot: member.phr_rating ?? null,
                    roster_role: member.roster_role || 'player',
                })))
                .select();
            if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
            insertedMembers = data || [];
        }

        return NextResponse.json({ success: true, entry: { ...entry, members: insertedMembers } });
    } catch (err) {
        console.error('Entries POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
