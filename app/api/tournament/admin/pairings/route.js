import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET all pairings for admin view
export async function GET() {
    try {
        if (!supabaseAdmin) {
            return NextResponse.json({
                error: 'Configuration Error',
                message: 'supabaseAdmin client is not initialized. Check environment variables.',
                env_check: {
                    url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
                    key: !!process.env.SUPABASE_SERVICE_ROLE_KEY
                }
            }, { status: 200 });
        }

        const { data, error } = await supabaseAdmin
            .from('tournament_pairings')
            .select('*')
            .order('round_number', { ascending: true })
            .order('pair_order', { ascending: true });

        if (error) {
            console.error('Error fetching pairings:', error);
            return NextResponse.json({
                error: 'Failed to fetch pairings',
                details: error
            }, { status: 200 });
        }

        // Group by team and round
        const grouped = {
            blue: { round1: [], round2: [], round3: [] },
            red: { round1: [], round2: [], round3: [] }
        };

        data.forEach(pairing => {
            let team = 'unknown';
            const rawTeam = pairing.team ? pairing.team.toLowerCase() : '';

            // Normalize team names
            if (rawTeam.includes('blue') || rawTeam.includes('xanh')) {
                team = 'blue';
            } else if (rawTeam.includes('red') || rawTeam.includes('do') || rawTeam.includes('đỏ')) {
                team = 'red';
            }

            const round = `round${pairing.round_number}`;
            if (grouped[team] && grouped[team][round]) {
                grouped[team][round].push(pairing);
            }
        });

        return NextResponse.json({ pairings: grouped });

    } catch (error) {
        console.error('Get pairings error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            message: error.message,
            stack: error.stack
        }, { status: 200 });
    }
}

// PUT - Update pairings for a specific team and round
export async function PUT(request) {
    try {
        const { team, round_number, pairings } = await request.json();

        if (!team || !round_number || !pairings) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Validate team
        if (!['blue', 'red'].includes(team.toLowerCase())) {
            return NextResponse.json({ error: 'Invalid team' }, { status: 400 });
        }

        // Validate round
        if (![1, 2, 3].includes(round_number)) {
            return NextResponse.json({ error: 'Invalid round number' }, { status: 400 });
        }

        // Update each pairing
        const updates = pairings.map(async (pairing) => {
            const { error } = await supabaseAdmin
                .from('tournament_pairings')
                .update({
                    player1_name: pairing.player1_name,
                    player2_name: pairing.player2_name,
                    updated_at: new Date().toISOString()
                })
                .eq('team', team)
                .eq('round_number', round_number)
                .eq('pair_order', pairing.pair_order); // UPDATED

            return error;
        });

        const results = await Promise.all(updates);
        const errors = results.filter(e => e !== null);

        if (errors.length > 0) {
            console.error('Errors updating pairings:', errors);
            return NextResponse.json({ error: 'Failed to update some pairings' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Pairings updated successfully' });

    } catch (error) {
        console.error('Update pairings error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
