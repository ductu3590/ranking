import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getClubScope } from '@/lib/groupSession';
import { computeStageStandings } from '@/lib/tournament/standingsService';
import { qualificationOutlook } from '@/lib/tournament/qualification';
import { resolveTiebreak } from '@/lib/tournament/rules/tiebreak';

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

        const advance = Number(stage.config?.advance?.slots || stage.config?.advance || 2);
        const winPoints = Number(stage.config?.scoring?.winPoints || stage.config?.winPoints || 2);
        const remaining = {};
        for (const match of result.matches || []) {
            if (match.status === 'done' || match.status === 'finalized') continue;
            for (const id of [match.entrant_a_id, match.entrant_b_id]) {
                if (id != null) remaining[id] = Number(remaining[id] || 0) + 1;
            }
        }
        const outlook = {};
        for (const [label, rows] of Object.entries((result.standings || []).reduce((groups, row) => {
            const key = row.group_label || 'A';
            (groups[key] ||= []).push(row);
            return groups;
        }, {}))) {
            Object.assign(outlook, qualificationOutlook(rows, remaining, { slots: advance, winPoints, groupLabel: label }));
        }
        const criteriaLabels = {
            match_points: 'Điểm', diff: 'Hiệu số', point_diff: 'Hiệu số điểm', game_diff: 'Hiệu số ván',
            head_to_head: 'Đối đầu trực tiếp', points_for: 'Điểm ghi được', seed: 'Hạt giống', draw_lot: 'Bốc thăm',
        };
        const policy = resolveTiebreak({}, {}, stage);
        return NextResponse.json({
            ...result,
            outlook,
            tiebreak_criteria: (policy.order || []).map((item) => criteriaLabels[item] || item),
        });
    } catch (err) {
        console.error('Standings v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
