import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { projectSchedule, computeCourtState, averageMatchMinutes } from '@/lib/tournament/courtBoard';

const db = supabaseAdmin || supabaseServer;
const DEFAULT_MATCH_MINUTES = 22;
const DEFAULT_WARMUP_MINUTES = 4;

export async function GET(request) {
  try {
    const tournamentId = new URL(request.url).searchParams.get('tournamentId');
    if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'read' });
    if (!access.ok) return access.response;
    const [tournamentResult, courtResult, stageResult] = await Promise.all([
      db.from('tournaments').select('id, settings').eq('id', tournamentId).eq('group_id', access.groupId).maybeSingle(),
      db.from('tournament_courts').select('id, label, surface, active').eq('group_id', access.groupId).eq('tournament_id', tournamentId).order('label'),
      db.from('tournament_stages').select('id, name, division_id').eq('group_id', access.groupId).eq('tournament_id', tournamentId),
    ]);
    const firstError = tournamentResult.error || courtResult.error || stageResult.error;
    if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
    const operations = (tournamentResult.data?.settings || {}).operations || {};
    const matchMinutes = Number(operations.estimated_match_minutes || DEFAULT_MATCH_MINUTES);
    const warmupMinutes = Number(operations.warmup_minutes || DEFAULT_WARMUP_MINUTES);
    const stageIds = (stageResult.data || []).map((stage) => stage.id);
    let matches = [];
    if (stageIds.length) {
      const result = await db.from('tournament_matches').select('id, stage_id, round, status, court, match_order, entry_a_id, entry_b_id, warmup_started_at, started_at, ended_at, version')
        .eq('group_id', access.groupId).in('stage_id', stageIds).order('match_order', { ascending: true });
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      matches = result.data || [];
    }
    const assignmentResult = await db.from('tournament_match_assignments').select('match_id, court_id, scheduled_start, locked')
      .eq('group_id', access.groupId).eq('tournament_id', tournamentId);
    if (assignmentResult.error) return NextResponse.json({ error: assignmentResult.error.message }, { status: 500 });
    const assignmentByMatch = new Map((assignmentResult.data || []).map((assignment) => [assignment.match_id, assignment]));
    const matchesByCourt = new Map();
    for (const match of matches) {
      const assignment = assignmentByMatch.get(match.id);
      if (!assignment?.court_id) continue;
      if (!matchesByCourt.has(assignment.court_id)) matchesByCourt.set(assignment.court_id, []);
      matchesByCourt.get(assignment.court_id).push(match);
    }
    const queue = matches.filter((match) => match.status === 'pending').map((match) => {
      const assignment = assignmentByMatch.get(match.id);
      return { id: match.id, locked_start: assignment?.locked ? assignment.scheduled_start : null };
    });
    const runningByCourt = {};
    for (const [courtId, courtMatches] of matchesByCourt.entries()) {
      const running = courtMatches.find((match) => ['warmup', 'live', 'paused'].includes(match.status));
      if (running) runningByCourt[courtId] = running;
    }
    const projection = projectSchedule({ courts: courtResult.data || [], runningByCourt, queue, matchMinutes, now: Date.now() });
    const courts = (courtResult.data || []).map((court) => ({ ...court,
      ...computeCourtState(court, matchesByCourt.get(court.id) || [], queue.length), matches: matchesByCourt.get(court.id) || [] }));
    return NextResponse.json({ courts, queue: queue.map((item) => ({ ...item, projected_start: projection.byMatchId[item.id] || null })), matches,
      settings: { matchMinutes, warmupMinutes }, progress: { total: matches.length, finalized: matches.filter((match) => match.status === 'finalized').length,
        finish_at: projection.finishAt, average_match_minutes: averageMatchMinutes(matches) } });
  } catch (error) {
    console.error('Assignments GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const tournamentId = body?.tournament_id;
    const matchId = body?.match_id;
    if (!tournamentId || !matchId) return NextResponse.json({ error: 'tournament_id và match_id là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'write' });
    if (!access.ok) return access.response;
    const matchResult = await db.from('tournament_matches').select('id, stage_id, status').eq('id', matchId).eq('group_id', access.groupId).maybeSingle();
    if (matchResult.error) return NextResponse.json({ error: matchResult.error.message }, { status: 500 });
    if (!matchResult.data) return NextResponse.json({ error: 'Không tìm thấy trận' }, { status: 404 });
    if (matchResult.data.status !== 'pending') return NextResponse.json({ error: 'Chỉ đổi sân được cho trận chưa gọi.', code: 'MATCH_NOT_PENDING' }, { status: 409 });
    const stageResult = await db.from('tournament_stages').select('division_id').eq('id', matchResult.data.stage_id).eq('group_id', access.groupId).maybeSingle();
    if (stageResult.error) return NextResponse.json({ error: stageResult.error.message }, { status: 500 });
    const { error } = await db.from('tournament_match_assignments').upsert({ group_id: access.groupId, tournament_id: tournamentId,
      division_id: stageResult.data?.division_id, match_id: Number(matchId), court_id: body?.court_id == null ? null : body.court_id,
      locked: body?.locked === true }, { onConflict: 'group_id,match_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Assignments PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}