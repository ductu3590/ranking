import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';
import { canTransitionMatch, resultTypeFor, timestampsFor } from '@/lib/tournament/matchLifecycle';

const db = supabaseAdmin || supabaseServer;

const RUNNING = ['warmup', 'live', 'paused'];

// Gọi sân: đủ hai cặp, không cặp nào đang ở trận khác, sân không bận (spec E1 §6.4).
async function checkCallReadiness(groupId, tournamentId, match, courtId) {
  if (match.entry_a_id == null || match.entry_b_id == null) {
    return { status: 409, body: { error: 'Trận chưa đủ hai cặp — chờ kết quả trận trước.', code: 'MATCH_NOT_READY' } };
  }
  const stages = await db.from('tournament_stages').select('id').eq('group_id', groupId).eq('tournament_id', tournamentId);
  if (stages.error) throw stages.error;
  const stageIds = (stages.data || []).map((stage) => stage.id);
  const entryIds = [match.entry_a_id, match.entry_b_id];
  const running = await db.from('tournament_matches').select('id, entry_a_id, entry_b_id, court')
    .eq('group_id', groupId).in('stage_id', stageIds).in('status', RUNNING).neq('id', match.id);
  if (running.error) throw running.error;
  const busy = (running.data || []).find((item) => entryIds.includes(item.entry_a_id) || entryIds.includes(item.entry_b_id));
  if (busy) {
    return { status: 409, body: { error: `Cặp đang đấu ở ${busy.court || 'sân khác'} — chưa gọi được.`, code: 'ENTRY_BUSY', court: busy.court || null } };
  }
  if (courtId !== undefined && courtId !== null) {
    const onCourt = await db.from('tournament_match_assignments').select('match_id').eq('group_id', groupId).eq('court_id', courtId);
    if (onCourt.error) throw onCourt.error;
    const runningIds = new Set((running.data || []).map((item) => String(item.id)));
    if ((onCourt.data || []).some((item) => runningIds.has(String(item.match_id)))) {
      return { status: 409, body: { error: 'Sân đang có trận — chọn sân trống.', code: 'COURT_BUSY' } };
    }
  }
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const matchId = body?.match_id;
    const to = body?.to;
    const reason = String(body?.reason || '').trim();
    if (!matchId || !to) return NextResponse.json({ error: 'match_id và to là bắt buộc' }, { status: 400 });
    const matchResult = await db.from('tournament_matches').select('id, group_id, stage_id, status, version, result_type, court, entry_a_id, entry_b_id, warmup_started_at, started_at, ended_at')
      .eq('id', matchId).maybeSingle();
    if (matchResult.error) return NextResponse.json({ error: matchResult.error.message }, { status: 500 });
    if (!matchResult.data) return NextResponse.json({ error: 'Không tìm thấy trận' }, { status: 404 });
    const stageResult = await db.from('tournament_stages').select('id, tournament_id, division_id').eq('id', matchResult.data.stage_id).maybeSingle();
    if (stageResult.error) return NextResponse.json({ error: stageResult.error.message }, { status: 500 });
    if (!stageResult.data) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });
    const access = await requireTournamentAccess({ tournamentId: stageResult.data.tournament_id, need: 'write' });
    if (!access.ok) return access.response;
    // Chốt trận chỉ qua POST /games (tỉ số + tiến cấp) hoặc POST /withdraw (W.O./bỏ cuộc, RPC 096):
    // chốt ở đây không có người thắng nên trận loại trực tiếp không bao giờ điền cặp vào trận sau (spec E1 §6.4).
    if (to === 'finalized') return NextResponse.json({ error: 'Chốt trận bằng "Nhập tỉ số" hoặc "Xử thắng W.O."/"Bỏ cuộc".', code: 'USE_SCORE_ENTRY' }, { status: 400 });
    const verdict = canTransitionMatch(matchResult.data.status, to);
    if (!verdict.ok) return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
    if (verdict.requiresReason && !reason) return NextResponse.json({ error: 'Thao tác này phải nhập lý do.', code: 'REASON_REQUIRED' }, { status: 400 });
    if (matchResult.data.status === 'pending' && to === 'warmup') {
      const readiness = await checkCallReadiness(access.groupId, stageResult.data.tournament_id, matchResult.data, body?.court_id);
      if (readiness) return NextResponse.json(readiness.body, { status: readiness.status });
    }
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