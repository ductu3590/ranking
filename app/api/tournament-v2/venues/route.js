import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';

const db = supabaseAdmin || supabaseServer;

export async function GET(request) {
  try {
    const tournamentId = new URL(request.url).searchParams.get('tournamentId');
    if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'read' });
    if (!access.ok) return access.response;
    const { data, error } = await db.from('tournament_venues').select('id, name, address, timezone, contact, map_link')
      .eq('group_id', access.groupId).eq('tournament_id', tournamentId).order('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ venues: data || [] });
  } catch (error) {
    console.error('Venues GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const tournamentId = body?.tournament_id;
    const name = String(body?.name || '').trim();
    if (!tournamentId) return NextResponse.json({ error: 'tournament_id là bắt buộc' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'Tên địa điểm là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ tournamentId, need: 'write' });
    if (!access.ok) return access.response;
    const payload = { group_id: access.groupId, tournament_id: tournamentId, name,
      address: String(body?.address || '').trim() || null, timezone: String(body?.timezone || '').trim() || null,
      contact: String(body?.contact || '').trim() || null, map_link: String(body?.map_link || '').trim() || null };
    const query = body?.id
      ? db.from('tournament_venues').update(payload).eq('id', body.id).eq('group_id', access.groupId)
      : db.from('tournament_venues').insert(payload);
    const { data, error } = await query.select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ venue: data });
  } catch (error) {
    console.error('Venues POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}