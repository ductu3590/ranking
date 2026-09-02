import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getClubScope } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

// GET /api/tournament-v2/matches?stageId=<id>
// Danh sách trận của 1 stage + games gom theo match_id (cho console nhập tỉ số).
// Đọc nội bộ console: cần signed group session; public link dùng /public snapshot.
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

        // 1. matches của stage, group-scoped, sắp theo match_order
        const { data: matches, error: mErr } = await db
            .from('tournament_matches')
            .select('*')
            .eq('group_id', groupId)
            .eq('stage_id', stageId)
            .order('match_order', { ascending: true });
        if (mErr) {
            return NextResponse.json({ error: mErr.message }, { status: 500 });
        }
        const matchList = matches || [];

        // 2. games của các match, gom theo match_id
        const gamesByMatchId = {};
        const matchIds = matchList.map((m) => m.id);
        if (matchIds.length) {
            const { data: games, error: gErr } = await db
                .from('tournament_games')
                .select('*')
                .eq('group_id', groupId)
                .in('match_id', matchIds)
                .order('game_no', { ascending: true });
            if (gErr) {
                return NextResponse.json({ error: gErr.message }, { status: 500 });
            }
            for (const g of games || []) {
                if (!gamesByMatchId[g.match_id]) gamesByMatchId[g.match_id] = [];
                gamesByMatchId[g.match_id].push(g);
            }
        }

        return NextResponse.json({ matches: matchList, gamesByMatchId });
    } catch (err) {
        console.error('Matches v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
