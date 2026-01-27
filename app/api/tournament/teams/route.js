import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// GET /api/tournament/teams
// Fetch all teams and their players
export async function GET() {
    try {
        // Fetch teams
        const { data: teams, error: teamsError } = await supabase
            .from('tournament_teams')
            .select('*')
            .eq('tournament_id', 1)
            .order('team_code');

        if (teamsError) throw teamsError;

        // Fetch all players
        const { data: players, error: playersError } = await supabase
            .from('tournament_players')
            .select('*')
            .eq('tournament_id', 1)
            .eq('is_active', true)
            .order('display_order');

        if (playersError) throw playersError;

        // Group players by team
        const teamsWithPlayers = teams.map(team => ({
            ...team,
            players: players.filter(p => p.team_id === team.id)
        }));

        return NextResponse.json({
            success: true,
            teams: teamsWithPlayers
        });

    } catch (error) {
        console.error('Error fetching teams:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
