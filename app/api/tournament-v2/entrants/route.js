import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireGroupAdmin, getClubScope } from '@/lib/groupSession';

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
    // tournament_entrants không có cột updated_at (migration 015) — không ghi.
    return payload;
}

function normalizeMemberId(value) {
    if (value === null || value === undefined || value === '') return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function resolveMemberGroups(members) {
    if (!Array.isArray(members) || members.length === 0) {
        return { memberGroups: new Map(), error: null };
    }

    const memberIds = [];
    for (const member of members) {
        if (member?.member_id === null || member?.member_id === undefined || member?.member_id === '') {
            continue;
        }
        const memberId = normalizeMemberId(member.member_id);
        if (!memberId) {
            return { memberGroups: new Map(), error: 'member_id không hợp lệ' };
        }
        if (!memberIds.includes(memberId)) memberIds.push(memberId);
    }

    if (memberIds.length === 0) {
        return { memberGroups: new Map(), error: null };
    }

    const { data, error } = await db
        .from('club_members')
        .select('id, group_id')
        .in('id', memberIds);
    if (error) return { memberGroups: new Map(), error: error.message };

    const memberGroups = new Map((data || []).map((member) => [Number(member.id), member.group_id]));
    if (memberIds.some((memberId) => !memberGroups.has(memberId))) {
        return { memberGroups: new Map(), error: 'Một hoặc nhiều member_id không tồn tại' };
    }
    return { memberGroups, error: null };
}

function buildMemberRows(members, groupId, entrantId, memberGroups = new Map()) {
    if (!Array.isArray(members)) return [];
    return members.map((m) => {
        const memberId = normalizeMemberId(m?.member_id);
        return {
            group_id: groupId,
            entrant_id: entrantId,
            member_id: memberId,
            member_group_id: memberId === null ? null : memberGroups.get(memberId),
            display_name: m?.display_name || null,
            gender: m?.gender || null,
        };
    });
}

export async function GET(request) {
    try {
        const scope = getClubScope();
        if (!scope.ok) return scope.response;
        const groupId = scope.groupId;
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
            .in('entrant_id', entrantIds)
            .order('id', { ascending: true });

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
        if (!String(body.name || '').trim()) {
            return NextResponse.json({ error: 'Tên đội/cặp là bắt buộc' }, { status: 400 });
        }

        const payload = buildEntrantPayload(body, adminCheck.groupId);
        const memberResolution = await resolveMemberGroups(body.members);
        if (memberResolution.error) {
            return NextResponse.json({ error: memberResolution.error }, { status: 400 });
        }

        const { data: entrant, error } = await db
            .from('tournament_entrants')
            .insert(payload)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let members = [];
        const memberRows = buildMemberRows(
            body.members,
            adminCheck.groupId,
            entrant.id,
            memberResolution.memberGroups,
        );
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

        const memberResolution = await resolveMemberGroups(body.members);
        if (memberResolution.error) {
            return NextResponse.json({ error: memberResolution.error }, { status: 400 });
        }

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

            const memberRows = buildMemberRows(
                body.members,
                adminCheck.groupId,
                id,
                memberResolution.memberGroups,
            );
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
