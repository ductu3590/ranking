import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { waitlistView } from '@/lib/tournament/openRegistration';

const db = supabaseAdmin || supabaseServer;

// Bảng duyệt đăng ký cho BTC: nhóm theo trạng thái + xếp hàng chờ theo sức chứa.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const divisionId = searchParams.get('divisionId');
    if (!divisionId) return NextResponse.json({ error: 'divisionId là bắt buộc' }, { status: 400 });

    const access = await requireTournamentAccess({ divisionId, need: 'read' });
    if (!access.ok) return access.response;

    const { data: division } = await db.from('tournament_divisions')
      .select('id, name, entrant_type, registration_open, registration_capacity, registration_deadline, gender_mode, age_min, age_max, rating_cap')
      .eq('id', divisionId).eq('group_id', access.groupId).maybeSingle();
    if (!division) return NextResponse.json({ error: 'Không tìm thấy nội dung' }, { status: 404 });

    const { data: regs } = await db.from('tournament_registrations')
      .select('id, status, origin, needs_partner, contact_phone_norm, self_declared_club, queue_seq, created_at')
      .eq('division_id', divisionId).eq('group_id', access.groupId)
      .order('queue_seq', { ascending: true });
    const rows = regs || [];

    const ids = rows.map((r) => r.id);
    let membersByReg = new Map();
    if (ids.length) {
      const { data: members } = await db.from('tournament_registration_members')
        .select('registration_id, seat, full_name, phone_norm, self_declared_phr, gender, dob')
        .in('registration_id', ids).order('seat');
      for (const m of members || []) {
        if (!membersByReg.has(m.registration_id)) membersByReg.set(m.registration_id, []);
        membersByReg.get(m.registration_id).push(m);
      }
    }
    const withMembers = rows.map((r) => ({ ...r, members: membersByReg.get(r.id) || [] }));

    const approved = withMembers.filter((r) => r.status === 'approved');
    const submitted = withMembers.filter((r) => r.status === 'submitted');
    const awaiting_partner = withMembers.filter((r) => r.status === 'awaiting_partner');
    const rejected = withMembers.filter((r) => r.status === 'rejected');
    const withdrawn = withMembers.filter((r) => r.status === 'withdrawn');

    const view = waitlistView({ capacity: division.registration_capacity, approvedCount: approved.length, pending: submitted });

    return NextResponse.json({
      division,
      capacity: division.registration_capacity ?? null,
      free_slots: view.freeSlots,
      groups: {
        approved,
        submitted: view.rows,
        awaiting_partner,
        rejected,
        withdrawn,
      },
      counts: {
        approved: approved.length,
        submitted: submitted.length,
        awaiting_partner: awaiting_partner.length,
        rejected: rejected.length,
        withdrawn: withdrawn.length,
      },
    });
  } catch (err) {
    console.error('registrations/board GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
