import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { isPubliclyOpen, resolveOrganizerMode } from '@/lib/tournament/openRegistration';

const db = supabaseAdmin || supabaseServer;

// Danh sách công khai phải phản ánh DB theo thời gian thực, không được cache tĩnh.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Danh sách giải Cộng đồng đang mở đăng ký + các nội dung mở. Công khai, không auth.
export async function GET() {
  try {
    const { data: tournaments, error } = await db
      .from('tournaments')
      .select('id, public_slug, name, location, event_date, organizer_type, settings, visibility')
      .in('visibility', ['unlisted', 'public'])
      .order('event_date', { ascending: true });
    if (error) throw error;
    const openTournaments = (tournaments || []).filter((t) => isPubliclyOpen(t));
    const ids = openTournaments.map((t) => t.id);
    let divisions = [];
    if (ids.length) {
      const { data, error: dErr } = await db
        .from('tournament_divisions')
        .select('id, tournament_id, name, entrant_type, play_type, registration_open, registration_capacity, registration_deadline')
        .in('tournament_id', ids)
        .eq('registration_open', true);
      if (dErr) throw dErr;
      divisions = data || [];
    }
    const byT = new Map();
    for (const d of divisions) {
      if (!byT.has(d.tournament_id)) byT.set(d.tournament_id, []);
      byT.get(d.tournament_id).push(d);
    }
    const list = openTournaments
      .map((t) => {
        const { settings, ...rest } = t;
        return { ...rest, organizer_mode: resolveOrganizerMode(t), open_registration: settings?.open_registration === true, divisions: byT.get(t.id) || [] };
      })
      .filter((t) => t.divisions.length > 0);
    return NextResponse.json({ tournaments: list });
  } catch (err) {
    console.error('public/community GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
