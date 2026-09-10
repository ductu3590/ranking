import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';

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
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }
        const access = await requireTournamentAccess({ tournamentId, need: 'read' });
        if (!access.ok) return access.response;
        const groupId = access.groupId;

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
            // Giải tạo bằng wizard lưu đội ở tournament_entries theo division.
            // Trả về cùng shape {id, name, seed} để UI không phải biết hai nguồn.
            const { data: divisions, error: divErr } = await db
                .from('tournament_divisions')
                .select('id')
                .eq('group_id', groupId)
                .eq('tournament_id', tournamentId);
            if (divErr) {
                return NextResponse.json({ error: divErr.message }, { status: 500 });
            }
            const divisionIds = (divisions || []).map((d) => d.id);
            if (divisionIds.length === 0) {
                return NextResponse.json({ entrants: [] });
            }

            const { data: entries, error: entryErr } = await db
                .from('tournament_entries')
                .select('id, division_id, name_snapshot, color_snapshot, seed, status')
                .eq('group_id', groupId)
                .in('division_id', divisionIds)
                .order('seed', { ascending: true });
            if (entryErr) {
                return NextResponse.json({ error: entryErr.message }, { status: 500 });
            }

            const entryIds = (entries || []).map((e) => e.id);
            let membersByEntry = {};
            if (entryIds.length) {
                const { data: entryMembers, error: emErr } = await db
                    .from('tournament_entry_members')
                    .select('id, entry_id, display_name_snapshot, club_name_snapshot, roster_role')
                    .eq('group_id', groupId)
                    .in('entry_id', entryIds)
                    .order('id', { ascending: true });
                if (emErr) {
                    return NextResponse.json({ error: emErr.message }, { status: 500 });
                }
                for (const member of entryMembers || []) {
                    const key = String(member.entry_id);
                    if (!membersByEntry[key]) membersByEntry[key] = [];
                    membersByEntry[key].push(member);
                }
            }

            return NextResponse.json({
                entrants: (entries || []).map((e) => ({
                    id: e.id,
                    tournament_id: Number(tournamentId),
                    division_id: e.division_id,
                    name: e.name_snapshot,
                    seed: e.seed,
                    color: e.color_snapshot ?? null,
                    status: e.status,
                    source: 'entry',
                    members: membersByEntry[String(e.id)] || [],
                })),
            });
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
        const body = await request.json();
        const tournamentId = body.tournament_id;
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournament_id is required' }, { status: 400 });
        }
        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;
        const groupId = access.groupId;
        if (!String(body.name || '').trim()) {
            return NextResponse.json({ error: 'Tên đội/cặp là bắt buộc' }, { status: 400 });
        }

        const payload = buildEntrantPayload(body, groupId);
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
            groupId,
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
        const body = await request.json();
        const id = body?.id;
        if (!id) {
            return NextResponse.json({ error: 'Entrant id is required' }, { status: 400 });
        }
        const { data: existingEntrant, error: existingError } = await db.from('tournament_entrants').select('tournament_id').eq('id', id).maybeSingle();
        if (existingError || !existingEntrant) return NextResponse.json({ error: 'Entrant không tồn tại' }, { status: 404 });
        const access = await requireTournamentAccess({ tournamentId: existingEntrant.tournament_id, need: 'write' });
        if (!access.ok) return access.response;
        const groupId = access.groupId;

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
            .eq('group_id', groupId)
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
                .eq('group_id', groupId)
                .eq('entrant_id', id);
            if (delErr) {
                return NextResponse.json({ error: delErr.message }, { status: 500 });
            }

            const memberRows = buildMemberRows(
                body.members,
                groupId,
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
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Entrant id is required' }, { status: 400 });
        }
        const { data: existingEntrant, error: existingError } = await db.from('tournament_entrants').select('tournament_id').eq('id', id).maybeSingle();
        if (existingError || !existingEntrant) return NextResponse.json({ error: 'Entrant không tồn tại' }, { status: 404 });
        const access = await requireTournamentAccess({ tournamentId: existingEntrant.tournament_id, need: 'write' });
        if (!access.ok) return access.response;

        const { error } = await db
            .from('tournament_entrants')
            .delete()
            .eq('id', id)
            .eq('group_id', access.groupId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Entrants v2 DELETE error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
