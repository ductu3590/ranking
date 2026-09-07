import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { normalizePublicSlug } from '@/lib/tournament/publicSnapshot';
import { normalizePhone, waitlistView, OpenRegError } from '@/lib/tournament/openRegistration';

const db = supabaseAdmin || supabaseServer;

// Tra cứu trạng thái đăng ký công khai: theo track_token, hoặc theo slug+divisionId+SĐT.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    let regQuery = null;

    if (token) {
      regQuery = db.from('tournament_registrations')
        .select('id, division_id, group_id, status, needs_partner, origin, track_token, contact_phone_norm')
        .eq('track_token', token).maybeSingle();
    } else {
      const slug = normalizePublicSlug(searchParams.get('slug'));
      const divisionId = searchParams.get('divisionId');
      const rawPhone = searchParams.get('phone');
      if (!slug || !divisionId || !rawPhone) return NextResponse.json({ error: 'Thiếu tham số tra cứu' }, { status: 400 });
      let phone;
      try { phone = normalizePhone(rawPhone); } catch (e) {
        if (e instanceof OpenRegError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
        throw e;
      }
      const { data: tournament } = await db.from('tournaments').select('id').eq('public_slug', slug).in('visibility', ['unlisted', 'public']).maybeSingle();
      if (!tournament) return NextResponse.json({ error: 'Giải không tồn tại' }, { status: 404 });
      regQuery = db.from('tournament_registrations')
        .select('id, division_id, group_id, status, needs_partner, origin, track_token, contact_phone_norm')
        .eq('division_id', divisionId).eq('contact_phone_norm', phone)
        .in('status', ['submitted', 'approved', 'awaiting_partner']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    }

    const { data: reg } = await regQuery;
    if (!reg) return NextResponse.json({ error: 'Không tìm thấy đăng ký' }, { status: 404 });

    const { data: members } = await db.from('tournament_registration_members')
      .select('seat, full_name, phone_norm, self_declared_phr, gender, dob').eq('registration_id', reg.id).order('seat');

    // Vị trí chờ nếu chưa được duyệt.
    let position = null;
    if (reg.status === 'submitted') {
      const { data: division } = await db.from('tournament_divisions').select('registration_capacity').eq('id', reg.division_id).maybeSingle();
      const { data: all } = await db.from('tournament_registrations')
        .select('id, status, queue_seq').eq('division_id', reg.division_id).in('status', ['submitted', 'approved']);
      const approvedCount = (all || []).filter((r) => r.status === 'approved').length;
      const pending = (all || []).filter((r) => r.status === 'submitted');
      const view = waitlistView({ capacity: division ? division.registration_capacity : null, approvedCount, pending });
      const mine = view.rows.find((r) => r.id === reg.id);
      if (mine && mine.isWaitlist) position = mine.position;
    }

    return NextResponse.json({
      registration: {
        id: reg.id, division_id: reg.division_id, status: reg.status,
        needs_partner: reg.needs_partner, origin: reg.origin, track_token: reg.track_token,
      },
      members: members || [],
      waitlist_position: position,
    });
  } catch (err) {
    console.error('public/registration/status GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
