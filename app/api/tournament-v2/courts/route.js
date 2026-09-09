import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';

const db = supabaseAdmin || supabaseServer;
const BLOCKING_STATUSES = ['warmup', 'live', 'paused'];

async function matchesOnCourt(courtId, groupId, statuses) {
  const { data: assignments, error: assignmentError } = await db.from('tournament_match_assignments')
    .select('match_id').eq('group_id', groupId).eq('court_id', courtId);
  if (assignmentError) throw assignmentError;
  const ids = (assignments || []).map((assignment) => assignment.match_id).filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await db.from('tournament_matches').select('id, status')
    .eq('group_id', groupId).in('id', ids).in('status', statuses);
  if (error) throw error;
  return data || [];
}

export async function GET(request) {
  try {
    const tournamentId = new URL(request.url).searchParams.get('tournamentId');
    if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'read' });
    if (!access.ok) return access.response;
    const { data, error } = await db.from('tournament_courts').select('id, venue_id, label, surface, active')
      .eq('group_id', access.groupId).eq('tournament_id', tournamentId).order('label');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ courts: data || [] });
  } catch (error) {
    console.error('Courts GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const tournamentId = body?.tournament_id;
    const venueId = body?.venue_id;
    const label = String(body?.label || '').trim();
    if (!tournamentId || !venueId) return NextResponse.json({ error: 'tournament_id và venue_id là bắt buộc' }, { status: 400 });
    if (!label) return NextResponse.json({ error: 'Tên sân là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'write' });
    if (!access.ok) return access.response;
    const payload = { group_id: access.groupId, tournament_id: tournamentId, venue_id: venueId, label,
      surface: String(body?.surface || '').trim() || null };
    const query = body?.id
      ? db.from('tournament_courts').update(payload).eq('id', body.id).eq('group_id', access.groupId)
      : db.from('tournament_courts').insert(payload);
    const { data, error } = await query.select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ court: data });
  } catch (error) {
    console.error('Courts POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const tournamentId = body?.tournament_id;
    const courtId = body?.id;
    const active = body?.active === true;
    const reason = String(body?.reason || '').trim();
    if (!tournamentId || !courtId) return NextResponse.json({ error: 'tournament_id và id là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'write' });
    if (!access.ok) return access.response;
    if (!active) {
      if (!reason) return NextResponse.json({ error: 'Tắt sân giữa giải phải nhập lý do.', code: 'REASON_REQUIRED' }, { status: 400 });
      const blocking = await matchesOnCourt(courtId, access.groupId, BLOCKING_STATUSES);
      if (blocking.length) return NextResponse.json({ error: 'Sân đang có trận chưa xong. Chốt hoặc chuyển trận trước.', code: 'COURT_HAS_ACTIVE_MATCH' }, { status: 409 });
    }
    const { data, error } = await db.from('tournament_courts').update({ active })
      .eq('id', courtId).eq('group_id', access.groupId).eq('active', !active).select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data && !active) {
      const pending = await matchesOnCourt(courtId, access.groupId, ['pending']);
      if (pending.length) {
        const { error: clearError } = await db.from('tournament_match_assignments').update({ court_id: null })
          .eq('group_id', access.groupId).eq('court_id', courtId).in('match_id', pending.map((match) => match.id));
        if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });
      }
      await writeOperationLog(db, { groupId: access.groupId, tournamentId, actor: access.actor?.kind || 'admin',
        action: 'court_toggled', targetType: 'court', targetId: courtId, before: { active: true }, after: { active: false }, reason });
    }
    return NextResponse.json({ success: true, court: data || null, already: !data });
  } catch (error) {
    console.error('Courts PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const params = new URL(request.url).searchParams;
    const tournamentId = params.get('tournamentId');
    const courtId = params.get('id');
    if (!tournamentId || !courtId) return NextResponse.json({ error: 'tournamentId và id là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'write' });
    if (!access.ok) return access.response;
    const { data: court, error: courtError } = await db.from('tournament_courts').select('id, label, active')
      .eq('id', courtId).eq('group_id', access.groupId).maybeSingle();
    if (courtError) return NextResponse.json({ error: courtError.message }, { status: 500 });
    if (!court) return NextResponse.json({ error: 'Không tìm thấy sân' }, { status: 404 });
    if (court.active) return NextResponse.json({ error: 'Tắt sân trước rồi mới xoá được.', code: 'COURT_IN_USE' }, { status: 409 });
    const blocked = await matchesOnCourt(courtId, access.groupId, ['pending', ...BLOCKING_STATUSES, 'finalized']);
    if (blocked.length) return NextResponse.json({ error: `${court.label} đã dùng cho trận trong giải này. Không xoá để giữ lịch sử.`, code: 'COURT_IN_USE' }, { status: 409 });
    const { error } = await db.from('tournament_courts').delete().eq('id', courtId).eq('group_id', access.groupId).eq('tournament_id', tournamentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Courts DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}