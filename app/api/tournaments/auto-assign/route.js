import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireGroupAdmin } from '@/lib/groupSession';
import {
    buildRandomPairs,
    buildRandomTeams,
    buildTournamentAssignments,
} from '@/lib/tournamentAssignment';

const db = supabaseAdmin || supabaseServer;

export async function POST(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const body = await request.json();
        const tournamentId = body?.tournamentId;
        if (!tournamentId) {
            return NextResponse.json({ error: 'Tournament id is required' }, { status: 400 });
        }

        const { data: tournament, error: tournamentError } = await db
            .from('tournaments')
            .select('id, tournament_format, team_size, teams_per_match')
            .eq('id', tournamentId)
            .eq('group_id', adminCheck.groupId)
            .single();
        if (tournamentError || !tournament) {
            return NextResponse.json({ error: tournamentError?.message || 'Tournament not found' }, { status: 404 });
        }

        let memberQuery = db
            .from('club_members')
            .select('id, full_name')
            .eq('group_id', adminCheck.groupId)
            .eq('is_active', true)
            .order('full_name', { ascending: true });

        if (Array.isArray(body?.memberIds) && body.memberIds.length > 0) {
            memberQuery = memberQuery.in('id', body.memberIds);
        }

        const { data: members, error: membersError } = await memberQuery;
        if (membersError) {
            return NextResponse.json({ error: membersError.message }, { status: 500 });
        }

        const format = body?.format || tournament.tournament_format || 'mlp_team';
        const teamSize = Number(body?.teamSize || tournament.team_size || 4);
        const teamsPerMatch = Number(body?.teamsPerMatch || tournament.teams_per_match || 2);
        const minimumPlayers = format === 'mlp_team' ? teamSize * teamsPerMatch : 2;
        if ((members || []).length < minimumPlayers) {
            return NextResponse.json({ error: `Cần ít nhất ${minimumPlayers} thành viên để chia tự động.` }, { status: 400 });
        }

        const assignments = format === 'mlp_team'
            ? buildRandomTeams(members, { teamSize, teamsPerMatch })
            : buildRandomPairs(members);
        buildTournamentAssignments(members, { format, teamSize, teamsPerMatch });

        for (const table of ['tournament_matches', 'tournament_pairings', 'tournament_players', 'tournament_teams']) {
            const { error } = await db
                .from(table)
                .delete()
                .eq('group_id', adminCheck.groupId)
                .eq('tournament_id', tournamentId);
            if (error) {
                return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
            }
        }

        const { data: teams, error: teamsError } = await db
            .from('tournament_teams')
            .insert(assignments.map((team) => ({
                group_id: adminCheck.groupId,
                tournament_id: tournamentId,
                team_name: team.team_name,
                team_code: team.team_code,
            })))
            .select('id, team_code, team_name');
        if (teamsError) {
            return NextResponse.json({ error: teamsError.message }, { status: 500 });
        }

        const playerRows = [];
        for (const team of assignments) {
            const savedTeam = teams.find((item) => item.team_code === team.team_code);
            for (const [index, member] of team.players.entries()) {
                playerRows.push({
                    group_id: adminCheck.groupId,
                    tournament_id: tournamentId,
                    team_id: savedTeam.id,
                    player_name: member.full_name,
                    display_order: index + 1,
                    is_active: true,
                });
            }
        }

        const { data: players, error: playersError } = await db
            .from('tournament_players')
            .insert(playerRows)
            .select('*');
        if (playersError) {
            return NextResponse.json({ error: playersError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            teams: teams.map((team) => ({
                ...team,
                players: players.filter((player) => player.team_id === team.id),
            })),
        });
    } catch (err) {
        console.error('Tournament auto assign error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
