import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getClubScope } from '@/lib/groupSession';
import { computeStageStandings } from '@/lib/tournament/standingsService';

const db = supabaseAdmin || supabaseServer;

export async function GET(request) {
    try {
        const scope = getClubScope();
        if (!scope.ok) return scope.response;
        const groupId = scope.groupId;

        const { searchParams } = new URL(request.url);
        const stageId = searchParams.get('stageId');
        if (!stageId) {
            return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
        }

        // 1. Load stage group-scoped
        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('*')
            .eq('id', stageId)
            .eq('group_id', groupId)
            .single();
        if (stageErr || !stage) {
            return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });
        }

        // 2. Build entrants + resolvedMatches and compute standings through the shared service.
        let result;
        try {
            result = await computeStageStandings(db, stage, groupId);
        } catch (e) {
            console.error('Standings load/match-engine error:', e);
            return NextResponse.json({ error: e.message }, { status: e.status || 400 });
        }

        return NextResponse.json(result);
    } catch (err) {
        console.error('Standings v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
