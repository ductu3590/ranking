import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireGroupAdmin, getEffectiveGroupContext } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

const ALLOWED_ENTRANT_FIELDS = ['tournament_id', 'name', 'seed', 'color'];

function buildEntrantPayload(body, groupId) {
    const payload = {};
    for (const field of ALLOWED_ENTRANT_FIELDS) {
        if (!(field in body)) continue;
        if (field === 'name') {
            payload[field] = String(body[field] || '').trim() || null;
        } else if (field === 'seed') {
            payload[field] = Number(body[field]) || null;
        } else {
            payload[field] = body[field] || null;
        }
    }
    if (groupId) {
        payload.group_id = groupId;
    }
    payload.updated_at = new Date().toISOString();
    return payload;
}

function buildMemberRows(members, groupId, entrantId) {
    if (!Array.isArray(members)) return [];
    return members.map((m) => ({
        group_id: groupId,
        entrant_id: entrantId,
        member_id: m.member_id || null,
        display_name: m.display_name || null,
        gender: m.gender || null,
    }));
}

export async function GET(request) {
    try {
        const { group_id: groupId } = getEffectiveGroupContext();
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }

        const { data: entrants, error } = await db
            .from('tournament_entrants')
            .select('*')
            .eq('group_id', groupId)
            .eq('tournament_id', tournamentId)
            .order('seed', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!entrants || entrants.length === 0) {
            return NextResponse.json({ entrants: [] });
        }

        const entrantIds = entrants.map((e) => e.id);
        const { data: members, error: membersErr } = await db
            .from('tournament_entrant_members')
            .select('*')
            .eq('group_id', groupId)
            .in('entrant_id', entrantIds);

        if (membersErr) {
            return NextResponse.json({ error: membersErr.message }, { status: 500 });
        }

        const membersByEntrant = {};
        for (const m of members || []) {
            if (!membersByEntrant[m.entrant_id]) membersByEntrant[m.entrant_id] = [];
            membersByEntrant[m.entrant_id].push(m);
        }

        const merged = entrants.map((e) => ({
            ...e,
            members: membersByEntrant[e.id] || [],
        }));

        return NextResponse.json({ entrants: merged });
    } catch (err) {
        console.error('Entrants v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const body = await request.json();
        const tournamentId = body.tournament_id;
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournament_id is required' }, { status: 400 });
        }

        const payload = buildEntrantPayload(body, adminCheck.groupId);

        const { data: entrant, error } = await db
            .from('tournament_entrants')
            .insert(payload)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let members = [];
        const memberRows = buildMemberRows(body.members, adminCheck.groupId, entrant.id);
        if (memberRows.length) {
            const { data: inserted, error: membersErr } = await db
                .from('tournament_entrant_members')
                .insert(memberRows)
                .select();
            if (membersErr) {
                return NextResponse.json({ error: membersErr.message }, { status: 500 });
            }
            members = inserted || [];
        }

        return NextResponse.json({ success: true, entrant, members });
    } catch (err) {
        console.error('Entrants v2 POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const body = await request.json();
        const id = body?.id;
        if (!id) {
            return NextResponse.json({ error: 'Entrant id is required' }, { status: 400 });
        }

        const payload = buildEntrantPayload(body);
        delete payload.group_id;
        delete payload.tournament_id;

        const { data: entrant, error } = await db
            .from('tournament_entrants')
            .update(payload)
            .eq('id', id)
            .eq('group_id', adminCheck.groupId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let members;
        if (Array.isArray(body.members)) {
            const { error: delErr } = await db
                .from('tournament_entrant_members')
                .delete()
                .eq('group_id', adminCheck.groupId)
                .eq('entrant_id', id);
            if (delErr) {
                return NextResponse.json({ error: delErr.message }, { status: 500 });
            }

            const memberRows = buildMemberRows(body.members, adminCheck.groupId, id);
            if (memberRows.length) {
                const { data: inserted, error: insErr } = await db
                    .from('tournament_entrant_members')
                    .insert(memberRows)
                    .select();
                if (insErr) {
                    return NextResponse.json({ error: insErr.message }, { status: 500 });
                }
                members = inserted || [];
            } else {
                members = [];
            }
        }

        return NextResponse.json({ success: true, entrant, members });
    } catch (err) {
        console.error('Entrants v2 PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Entrant id is required' }, { status: 400 });
        }

        const { error } = await db
            .from('tournament_entrants')
            .delete()
            .eq('id', id)
            .eq('group_id', adminCheck.groupId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Entrants v2 DELETE error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
