import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';

const db = supabaseAdmin || supabaseServer;

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const tournamentId = params.get('tournamentId');
    const limit = Math.min(Math.max(Number(params.get('limit') || 100), 1), 500);
    if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'read' });
    if (!access.ok) return access.response;
    const { data, error } = await db.from('tournament_operation_logs').select('id, actor, action, target_type, target_id, before, after, reason, created_at')
      .eq('group_id', access.groupId).eq('tournament_id', tournamentId).order('created_at', { ascending: false }).limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: data || [] });
  } catch (error) {
    console.error('Operation logs GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}