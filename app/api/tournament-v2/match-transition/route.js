import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';
import { canTransitionMatch, resultTypeFor, timestampsFor } from '@/lib/tournament/matchLifecycle';

const db = supabaseAdmin || supabaseServer;

export async function POST(request) {
  try {
    const body = await request.json();
    const matchId = body?.match_id;
    const to = body?.to;
    const reason = String(body?.reason || '').trim();
    if (!matchId || !to) return NextResponse.json({ error: 'match_id và to là bắt buộc' }, { status: 400 });
    const matchResult = await db.from('tournament_matches').select('id, group_id, stage_id, status, version, result_type, court, warmup_started_at, started_at, ended_at')
      .eq('id', matchId).maybeSingle();
    if (matchResult.error) return NextResponse.json({ error: matchResult.error.message }, { status: 500 });
    if (!matchResult.data) return NextResponse.json({ error: 'Không tìm thấy trận' }, { status: 404 });
    const stageResult = await db.from('tournament_stages').select('id, tournament_id, division_id').eq('id', matchResult.data.stage_id).maybeSingle();
    if (stageResult.error) return NextResponse.json({ error: stageResult.error.message }, { status: 500 });
    if (!stageResult.data) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });
    const access = await requireTournamentAccess({ tournamentId: stageResult.data.tournament_id, need: 'write' });
    if (!access.ok) return access.response;
    const verdict = canTransitionMatch(matchResult.data.status, to);
    if (!verdict.ok) return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
    if (verdict.requiresReason && !reason) return NextResponse.json({ error: 'Thao tác này phải nhập lý do.', code: 'REASON_REQUIRED' }, { status: 400 });
    const patch = { status: to, version: Number(matchResult.data.version) + 1, ...timestampsFor(matchResult.data.status, to, new Date().toISOString()) };
    const nextResultType = resultTypeFor(matchResult.data.status, to);
    if (nextResultType) patch.result_type = nextResultType;
    const updateResult = await db.from('tournament_matches').update(patch).eq('id', matchId).eq('group_id', access.groupId)
      .eq('version', matchResult.data.version).select().maybeSingle();
    if (updateResult.error) return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    if (!updateResult.data) return NextResponse.json({ error: 'Trận vừa được cập nhật. Tải lại rồi thử lại.', code: 'MATCH_VERSION_CONFLICT' }, { status: 409 });
    if (body?.court_id !== undefined && matchResult.data.status === 'pending' && to === 'warmup') {
      const courtResult = await db.from('tournament_courts').select('id, label').eq('id', body.court_id).eq('group_id', access.groupId).maybeSingle();
      await db.from('tournament_match_assignments').upsert({ group_id: access.groupId, tournament_id: stageResult.data.tournament_id,
        division_id: stageResult.data.division_id, match_id: Number(matchId), court_id: body.court_id }, { onConflict: 'group_id,match_id' });
      if (courtResult.data) await db.from('tournament_matches').update({ court: courtResult.data.label }).eq('id', matchId).eq('group_id', access.groupId);
    }
    await writeOperationLog(db, { groupId: access.groupId, tournamentId: stageResult.data.tournament_id, divisionId: stageResult.data.division_id,
      actor: access.actor?.kind || 'admin', action: verdict.action, targetType: 'match', targetId: matchId,
      before: { status: matchResult.data.status }, after: { status: to, result_type: nextResultType || matchResult.data.result_type }, reason: reason || null });
    return NextResponse.json({ success: true, match: updateResult.data });
  } catch (error) {
    console.error('Match transition error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}