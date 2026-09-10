import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';
import { validateTournamentAthlete } from '@/lib/tournament/interclub';
import { buildGuestAthletePayload, buildClubMemberAthletePayload } from '@/lib/tournament/wizardModel';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';

const db = supabaseAdmin || supabaseServer;

const SELECT_FIELDS = 'id, group_id, tournament_id, tournament_club_id, athlete_id, display_name_snapshot, club_name_snapshot, phr_rating, phr_status, source, created_at';

function domainError(error) {
    if (!error?.code || !/^[A-Z_]+$/.test(error.code)) return null;
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode');

        // Roster CLB: club_members là danh sách hiển thị, athletes là danh tính
        // dài hạn (athletes.legacy_club_member_id trỏ về club_members).
        if (mode === 'roster') {
            const scope = getClubScope();
            if (!scope.ok) return scope.response;
            const { data: members, error: membersError } = await db
                .from('club_members')
                .select('id, full_name, is_active')
                .eq('group_id', scope.groupId)
                .order('full_name', { ascending: true });
            if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
            const memberIds = (members || []).map((member) => member.id);
            let athleteByMemberId = new Map();
            if (memberIds.length) {
                const { data: athletes, error: athletesError } = await db
                    .from('athletes')
                    .select('id, display_name, legacy_club_member_id')
                    .in('legacy_club_member_id', memberIds);
                if (athletesError) return NextResponse.json({ error: athletesError.message }, { status: 500 });
                athleteByMemberId = new Map((athletes || []).map((athlete) => [Number(athlete.legacy_club_member_id), athlete]));
            }
            return NextResponse.json({
                roster: (members || []).map((member) => ({
                    member_id: member.id,
                    full_name: member.full_name,
                    is_active: member.is_active !== false,
                    athlete_id: athleteByMemberId.get(Number(member.id))?.id ?? null,
                })),
            });
        }

        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
        const access = await requireTournamentAccess({ tournamentId, need: 'read' });
        if (!access.ok) return access.response;
        const { data, error } = await db
            .from('tournament_athletes')
            .select(SELECT_FIELDS)
            .eq('group_id', access.groupId)
            .eq('tournament_id', tournamentId)
            .order('id', { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ athletes: data || [] });
    } catch (err) {
        console.error('Tournament athletes GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        if (!body?.tournament_id || !body?.tournament_club_id) {
            return NextResponse.json({ error: 'tournament_id và tournament_club_id là bắt buộc' }, { status: 400 });
        }
        const access = await requireTournamentAccess({ tournamentId: body.tournament_id, need: 'write' });
        if (!access.ok) return access.response;

        let payload;
        try {
            payload = body.athlete_id != null
                ? buildClubMemberAthletePayload(body)
                : buildGuestAthletePayload(body);
            validateTournamentAthlete(payload);
        } catch (error) {
            const response = domainError(error);
            if (response) return response;
            throw error;
        }

        const { data: participation, error: participationError } = await db
            .from('tournament_clubs')
            .select('id, tournament_id')
            .eq('id', body.tournament_club_id)
            .eq('group_id', access.groupId)
            .maybeSingle();
        if (participationError) throw participationError;
        if (!participation || String(participation.tournament_id) !== String(body.tournament_id)) {
            return NextResponse.json({ error: 'CLB tham dự không thuộc giải này' }, { status: 404 });
        }

        const { data, error } = await db
            .from('tournament_athletes')
            .insert({ ...payload, group_id: access.groupId })
            .select(SELECT_FIELDS)
            .single();
        if (error) {
            const duplicate = error.code === '23505';
            return NextResponse.json(
                { error: duplicate ? 'VĐV đã có trong giải' : error.message },
                { status: duplicate ? 409 : 500 },
            );
        }

        if (data.phr_rating != null) {
            await db.from('tournament_athlete_phr_history').insert({
                group_id: access.groupId,
                tournament_athlete_id: data.id,
                phr_rating: data.phr_rating,
                status: data.phr_status,
            });
        }

        return NextResponse.json({ success: true, athlete: data });
    } catch (err) {
        console.error('Tournament athletes POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
