import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { generateAndPersistSchedule } from '@/lib/tournament/generateSchedule';
import { resolveStageScoring } from '@/lib/tournament/rules/scoring';
import { resolveTiebreak } from '@/lib/tournament/rules/tiebreak';

const db = supabaseAdmin || supabaseServer;

function rpcErrorResponse(error) {
    const code = error?.code;
    const status = code === '40001' ? 409 : code === '22023' ? 400 : code === 'P0002' ? 404 : 500;
    const message = code === '40001' ? 'Lịch thi đấu đã thay đổi, hãy tải lại.' : error?.message || 'Không sinh được lịch.';
    return NextResponse.json({ error: message, code: code || 'MUTATION_FAILED' }, { status });
}

export async function POST(request) {
    try {
        const body = await request.json();
        const stageId = body?.stageId;
        const seed = body?.seed;
        if (!stageId) {
            return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
        }
        const access = await requireTournamentAccess({ stageId, need: 'write' });
        if (!access.ok) return access.response;
        const groupId = access.groupId;

        // 1. Load stage
        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('*')
            .eq('id', stageId)
            .eq('group_id', groupId)
            .single();
        if (stageErr || !stage) {
            return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });
        }

        // Commit the resolved, versioned policies with the draw snapshot. Later
        // tournament/division edits cannot change this stage's interpretation.
        if (!stage.config?.scoring || !stage.config?.tiebreak) {
            const [{ data: tournament, error: tournamentErr }, { data: division, error: divisionErr }] = await Promise.all([
                db.from('tournaments').select('default_scoring, tiebreak_policy').eq('id', stage.tournament_id).eq('group_id', groupId).single(),
                stage.division_id
                    ? db.from('tournament_divisions').select('scoring_override, tiebreak_override').eq('id', stage.division_id).eq('group_id', groupId).single()
                    : Promise.resolve({ data: {}, error: null }),
            ]);
            if (tournamentErr || divisionErr) return NextResponse.json({ error: tournamentErr?.message || divisionErr?.message }, { status: 500 });
            stage.config = {
                ...(stage.config || {}),
                scoring: resolveStageScoring(tournament || {}, division || {}, stage),
                tiebreak: resolveTiebreak(tournament || {}, division || {}, stage),
            };
            const { error: snapshotErr } = await db.from('tournament_stages').update({ config: stage.config }).eq('id', stageId).eq('group_id', groupId);
            if (snapshotErr) return NextResponse.json({ error: snapshotErr.message }, { status: 500 });
        }

        // 2. Get entrants for the stage
        let entrants = [];
        const { data: stageEntrants, error: seErr } = await db
            .from('tournament_stage_entrants')
            .select('entry_id, entrant_id, seed_in_stage, group_label')
            .eq('group_id', groupId)
            .eq('stage_id', stageId);
        if (seErr) {
            return NextResponse.json({ error: seErr.message }, { status: 500 });
        }

        if (stage.division_id) {
            const entryRows = stageEntrants?.filter((r) => r.entry_id != null) || [];
            if (entryRows.length) {
                entrants = entryRows.map((r) => ({ id: r.entry_id, seed: r.seed_in_stage, group_label: r.group_label }));
            } else {
                const { data: divisionEntries, error: entryErr } = await db
                    .from('tournament_entries')
                    .select('id, seed')
                    .eq('group_id', groupId)
                    .eq('division_id', stage.division_id);
                if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 });
                entrants = (divisionEntries || []).map((r) => ({ id: r.id, seed: r.seed }));
            }
        } else if (stageEntrants && stageEntrants.length) {
            entrants = stageEntrants.map((r) => ({ id: r.entrant_id, seed: r.seed_in_stage, group_label: r.group_label }));
        } else {
            const { data: tEntrants, error: teErr } = await db
                .from('tournament_entrants')
                .select('id, seed')
                .eq('group_id', groupId)
                .eq('tournament_id', stage.tournament_id);
            if (teErr) {
                return NextResponse.json({ error: teErr.message }, { status: 500 });
            }
            entrants = (tEntrants || []).map((r) => ({ id: r.id, seed: r.seed }));
        }

        if (entrants.length < 2) {
            return NextResponse.json({ error: 'Cần ít nhất 2 đội' }, { status: 400 });
        }

        // 3. Sinh lịch và ghi xuống DB. Logic nằm ở lib/tournament/generateSchedule.js
        // để route này và route `draw` (lúc chốt bốc thăm) dùng chung một bản —
        // chép hai bản là cách chắc chắn nhất để chúng lệch nhau sau vài tháng.
        const result = await generateAndPersistSchedule(db, {
            stage: { ...stage, id: stageId },
            entrants,
            groupId,
            seed: seed || 1,
            idempotencyKey: body?.idempotency_key || body?.idempotencyKey,
        });
        if (!result.ok) {
            if (result.rpcError) return rpcErrorResponse(result.rpcError);
            return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
        }
        return NextResponse.json(result.data);
    } catch (err) {
        console.error('Generate v2 POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
