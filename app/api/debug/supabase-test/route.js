import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// GET /api/debug/supabase-test
export async function GET() {
    try {
        console.log('=== TESTING SUPABASE CONNECTION ===');

        // Test 1: Get all pairings without filters
        const { data: allPairings, error: error1 } = await supabase
            .from('tournament_pairings')
            .select('*');

        console.log('Test 1 - All pairings:', allPairings?.length || 0, error1);

        // Test 2: Get with status filter
        const { data: submittedPairings, error: error2 } = await supabase
            .from('tournament_pairings')
            .select('*')
            .eq('status', 'submitted');

        console.log('Test 2 - Submitted pairings:', submittedPairings?.length || 0, error2);

        // Test 3: Get with team data using old method
        const { data: withTeam, error: error3 } = await supabase
            .from('tournament_pairings')
            .select('*, team:tournament_teams(*)')
            .eq('status', 'submitted')
            .limit(1);

        console.log('Test 3 - With team:', withTeam?.length || 0, error3);

        return NextResponse.json({
            success: true,
            tests: {
                test1_all: { count: allPairings?.length || 0, error: error1?.message },
                test2_submitted: { count: submittedPairings?.length || 0, error: error2?.message },
                test3_withTeam: { count: withTeam?.length || 0, error: error3?.message, data: withTeam }
            }
        });

    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
