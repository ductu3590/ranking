import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { buildOperationsBoard } from '@/lib/tournament/operationsBoard';

// Dữ liệu điều hành thay đổi liên tục — luôn render theo request.
export const dynamic = 'force-dynamic';

const db = supabaseAdmin || supabaseServer;
const DEFAULT_MATCH_MINUTES = 22;
const DEFAULT_WARMUP_MINUTES = 4;
const MATCH_SELECT = 'id, stage_id, division_id, round, bracket_slot, group_label, match_order, match_key, status, version, court, entry_a_id, entry_b_id, winner_entry_id, winner_entrant_id, result_type, warmup_started_at, started_at, ended_at';

// View model mục "Điều hành" (spec Epic 2, Lát E1 §4). Route đọc: need 'read', scope group_id.
// Chỉ trả tên cặp đang hiển thị + id/version cần cho thao tác; không trả thành viên, liên hệ, token.
export async function GET(request) {
  try {
    const tournamentId = new URL(request.url).searchParams.get('tournamentId');
    if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'read' });
    if (!access.ok) return access.response;
    const groupId = access.groupId;

    const [tournamentResult, divisionResult, stageResult, courtResult, assignmentResult] = await Promise.all([
      db.from('tournaments').select('id, status, settings, default_scoring').eq('id', tournamentId).eq('group_id', groupId).maybeSingle(),
      db.from('tournament_divisions').select('id, scoring_override').eq('group_id', groupId).eq('tournament_id', tournamentId),
      db.from('tournament_stages').select('id, name, status, division_id, stage_order, schedule_format, match_format, config').eq('group_id', groupId).eq('tournament_id', tournamentId).order('stage_order', { ascending: true }),
      db.from('tournament_courts').select('id, label, surface, active').eq('group_id', groupId).eq('tournament_id', tournamentId),
      db.from('tournament_match_assignments').select('match_id, court_id, scheduled_start, locked').eq('group_id', groupId).eq('tournament_id', tournamentId),
    ]);
    const firstError = tournamentResult.error || divisionResult.error || stageResult.error || courtResult.error || assignmentResult.error;
    if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
    if (!tournamentResult.data) return NextResponse.json({ error: 'Không tìm thấy giải' }, { status: 404 });

    const stages = stageResult.data || [];
    const stageIds = stages.map((stage) => stage.id);
    const divisionIds = (divisionResult.data || []).map((division) => division.id);
    let matches = [];
    let transitions = [];
    let entries = [];
    const gamesByMatchId = {};
    if (stageIds.length) {
      const [matchResult, transitionResult] = await Promise.all([
        db.from('tournament_matches').select(MATCH_SELECT).eq('group_id', groupId).in('stage_id', stageIds),
        db.from('tournament_stage_transitions')
          .select('source_kind, source_match_id, source_outcome, source_group_label, source_rank, source_pool_position, target_match_id, target_slot')
          .eq('group_id', groupId).eq('tournament_id', tournamentId),
      ]);
      if (matchResult.error || transitionResult.error) return NextResponse.json({ error: (matchResult.error || transitionResult.error).message }, { status: 500 });
      matches = matchResult.data || [];
      transitions = transitionResult.data || [];
      const scoredIds = matches.filter((match) => match.status !== 'pending').map((match) => match.id);
      if (scoredIds.length) {
        const gameResult = await db.from('tournament_games').select('match_id, game_no, kind, score_a, score_b').eq('group_id', groupId).in('match_id', scoredIds);
        if (gameResult.error) return NextResponse.json({ error: gameResult.error.message }, { status: 500 });
        for (const game of gameResult.data || []) {
          const key = String(game.match_id);
          if (!gamesByMatchId[key]) gamesByMatchId[key] = [];
          gamesByMatchId[key].push(game);
        }
      }
    }
    if (divisionIds.length) {
      const entryResult = await db.from('tournament_entries').select('id, name_snapshot').eq('group_id', groupId).in('division_id', divisionIds);
      if (entryResult.error) return NextResponse.json({ error: entryResult.error.message }, { status: 500 });
      entries = (entryResult.data || []).map((entry) => ({ id: entry.id, name: entry.name_snapshot }));
    }

    const operations = (tournamentResult.data.settings || {}).operations || {};
    const board = buildOperationsBoard({
      tournament: tournamentResult.data,
      divisions: divisionResult.data || [],
      stages,
      matches,
      courts: courtResult.data || [],
      assignments: assignmentResult.data || [],
      entries,
      transitions,
      gamesByMatchId,
      settings: {
        matchMinutes: Number(operations.estimated_match_minutes || DEFAULT_MATCH_MINUTES),
        warmupMinutes: Number(operations.warmup_minutes || DEFAULT_WARMUP_MINUTES),
      },
    }, { now: Date.now() });
    return NextResponse.json(board);
  } catch (error) {
    console.error('Operations board GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
