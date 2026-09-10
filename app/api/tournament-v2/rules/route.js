import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';
import { SCORING_PRESETS, resolveStageScoring } from '@/lib/tournament/rules/scoring';
import { TIEBREAK_PRESETS, resolveTiebreak } from '@/lib/tournament/rules/tiebreak';
import { buildRulesPreview, SCORING_PRESET_OPTIONS, TIEBREAK_PRESET_OPTIONS } from '@/lib/tournament/wizardModel';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';

const db = supabaseAdmin || supabaseServer;

const LOCKED_STAGE_STATUSES = new Set(['active', 'completed']);

async function loadContext(tournamentId, groupId) {
    const [tournamentResult, divisionResult, stageResult] = await Promise.all([
        db.from('tournaments').select('id, name, default_scoring, tiebreak_policy').eq('id', tournamentId).eq('group_id', groupId).maybeSingle(),
        db.from('tournament_divisions').select('id, name, play_type, scoring_override, tiebreak_override').eq('group_id', groupId).eq('tournament_id', tournamentId).order('id'),
        db.from('tournament_stages').select('id, division_id, name, status, config, stage_order').eq('group_id', groupId).eq('tournament_id', tournamentId).order('stage_order'),
    ]);
    const error = tournamentResult.error || divisionResult.error || stageResult.error;
    if (error) throw error;
    return {
        tournament: tournamentResult.data,
        divisions: divisionResult.data || [],
        stages: stageResult.data || [],
    };
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
        const access = await requireTournamentAccess({ tournamentId, need: 'read' });
        if (!access.ok) return access.response;

        const context = await loadContext(tournamentId, access.groupId);
        if (!context.tournament) return NextResponse.json({ error: 'Không tìm thấy giải' }, { status: 404 });

        return NextResponse.json({
            tournament: context.tournament,
            divisions: context.divisions,
            stages: context.stages,
            preview: buildRulesPreview(context),
            scoringPresets: SCORING_PRESET_OPTIONS,
            tiebreakPresets: TIEBREAK_PRESET_OPTIONS,
        });
    } catch (err) {
        console.error('Rules GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const body = await request.json();
        const tournamentId = body?.tournament_id;
        const scopeTarget = body?.scope === 'division' ? 'division' : 'tournament';
        if (!tournamentId) return NextResponse.json({ error: 'tournament_id là bắt buộc' }, { status: 400 });
        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;
        const groupId = access.groupId;
        if (scopeTarget === 'division' && !body?.division_id) {
            return NextResponse.json({ error: 'division_id là bắt buộc khi override theo nội dung' }, { status: 400 });
        }

        const scoringPreset = body?.scoring_preset;
        const tiebreakPreset = body?.tiebreak_preset;
        if (scoringPreset && scoringPreset !== 'inherit' && !SCORING_PRESETS[scoringPreset]) {
            return NextResponse.json({ error: 'Preset điểm số không hợp lệ', code: 'INVALID_SCORING_PRESET' }, { status: 400 });
        }
        if (tiebreakPreset && tiebreakPreset !== 'inherit' && !TIEBREAK_PRESETS[tiebreakPreset]) {
            return NextResponse.json({ error: 'Preset tie-break không hợp lệ', code: 'INVALID_TIEBREAK_PRESET' }, { status: 400 });
        }

        const context = await loadContext(tournamentId, groupId);
        if (!context.tournament) return NextResponse.json({ error: 'Không tìm thấy giải' }, { status: 404 });

        // Stage đã snapshot luật hoặc đã bắt đầu thì không đổi được nữa;
        // sửa kết quả chỉ qua correction workflow.
        const affectedStages = context.stages.filter((stage) => (
            scopeTarget === 'tournament' || String(stage.division_id) === String(body.division_id)
        ));
        const lockedStages = affectedStages.filter((stage) => (
            LOCKED_STAGE_STATUSES.has(String(stage.status || ''))
            || Boolean(stage.config?.scoring)
            || Boolean(stage.config?.tiebreak)
        ));
        if (lockedStages.length) {
            return NextResponse.json({
                error: 'Giai đoạn đã bốc thăm hoặc đang thi đấu — không đổi được luật.',
                code: 'RULES_LOCKED',
                stages: lockedStages.map((stage) => ({ id: stage.id, name: stage.name })),
            }, { status: 409 });
        }

        const patch = {};
        if (scopeTarget === 'tournament') {
            if (scoringPreset) patch.default_scoring = scoringPreset === 'inherit' ? {} : SCORING_PRESETS[scoringPreset];
            if (tiebreakPreset) patch.tiebreak_policy = tiebreakPreset === 'inherit' ? {} : TIEBREAK_PRESETS[tiebreakPreset];
            if (!Object.keys(patch).length) return NextResponse.json({ error: 'Không có thay đổi' }, { status: 400 });
            const { error } = await db.from('tournaments').update({ ...patch, updated_at: new Date().toISOString() })
                .eq('id', tournamentId).eq('group_id', groupId);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        } else {
            if (scoringPreset) patch.scoring_override = scoringPreset === 'inherit' ? null : SCORING_PRESETS[scoringPreset];
            if (tiebreakPreset) patch.tiebreak_override = tiebreakPreset === 'inherit' ? null : TIEBREAK_PRESETS[tiebreakPreset];
            if (!Object.keys(patch).length) return NextResponse.json({ error: 'Không có thay đổi' }, { status: 400 });
            const { error } = await db.from('tournament_divisions').update({ ...patch, updated_at: new Date().toISOString() })
                .eq('id', body.division_id).eq('group_id', groupId).eq('tournament_id', tournamentId);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const updated = await loadContext(tournamentId, groupId);
        return NextResponse.json({
            success: true,
            tournament: updated.tournament,
            divisions: updated.divisions,
            preview: buildRulesPreview(updated),
            // Giá trị hiệu lực hiện tại của từng stage, tính bằng chính hàm
            // domain sẽ được dùng khi commit draw.
            effective: updated.stages.map((stage) => {
                const division = updated.divisions.find((item) => String(item.id) === String(stage.division_id)) || {};
                return {
                    stage_id: stage.id,
                    scoring: resolveStageScoring(updated.tournament, division, stage),
                    tiebreak: resolveTiebreak(updated.tournament, division, stage),
                };
            }),
        });
    } catch (err) {
        console.error('Rules PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
