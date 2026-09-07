import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { normalizePublicSlug } from '@/lib/tournament/publicSnapshot';
import { isRegistrationOpen, validateSubmission, requiredMemberFields, OpenRegError, resolveOrganizerMode } from '@/lib/tournament/openRegistration';

const db = supabaseAdmin || supabaseServer;

async function resolveContext(slug, divisionId) {
  const { data: row } = await db.from('tournaments')
    .select('id, group_id, public_slug, name, location, event_date, organizer_type, settings, visibility')
    .eq('public_slug', slug).in('visibility', ['unlisted', 'public']).maybeSingle();
  if (!row) return { error: NextResponse.json({ error: 'Giải không tồn tại' }, { status: 404 }) };
  const tournament = {
    ...row,
    organizer_mode: resolveOrganizerMode(row),
    open_registration: row.settings?.open_registration === true,
  };
  const { data: division } = await db.from('tournament_divisions')
    .select('id, tournament_id, name, entrant_type, play_type, registration_open, registration_capacity, registration_deadline, allow_late_registration, gender_mode, age_min, age_max, entry_fee, rating_policy, rating_cap')
    .eq('id', divisionId).eq('tournament_id', tournament.id).maybeSingle();
  if (!division) return { error: NextResponse.json({ error: 'Nội dung không tồn tại' }, { status: 404 }) };
  return { tournament, division };
}

async function countByStatus(divisionId) {
  const { data } = await db.from('tournament_registrations')
    .select('id, status').eq('division_id', divisionId);
  const rows = data || [];
  return {
    approved: rows.filter((r) => r.status === 'approved').length,
    active: rows.filter((r) => ['submitted', 'approved', 'awaiting_partner'].includes(r.status)).length,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = normalizePublicSlug(searchParams.get('slug'));
    const divisionId = searchParams.get('divisionId');
    if (!slug || !divisionId) return NextResponse.json({ error: 'slug và divisionId là bắt buộc' }, { status: 400 });
    const ctx = await resolveContext(slug, divisionId);
    if (ctx.error) return ctx.error;
    const counts = await countByStatus(divisionId);
    return NextResponse.json({
      tournament: { name: ctx.tournament.name, location: ctx.tournament.location, event_date: ctx.tournament.event_date, public_slug: ctx.tournament.public_slug },
      division: ctx.division,
      fields: requiredMemberFields(ctx.division),
      capacity: ctx.division.registration_capacity ?? null,
      registered: counts.approved,
      open: isRegistrationOpen(ctx.tournament, ctx.division, new Date().toISOString()),
    });
  } catch (err) {
    console.error('public/registration GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body && body.company) return NextResponse.json({ error: 'invalid' }, { status: 400 }); // honeypot
    const slug = normalizePublicSlug(body.slug);
    const divisionId = body.divisionId;
    if (!slug || !divisionId) return NextResponse.json({ error: 'slug và divisionId là bắt buộc' }, { status: 400 });
    const ctx = await resolveContext(slug, divisionId);
    if (ctx.error) return ctx.error;

    const gate = isRegistrationOpen(ctx.tournament, ctx.division, new Date().toISOString());
    if (!gate.ok) return NextResponse.json({ error: 'Đăng ký đã đóng', code: gate.reason }, { status: 409 });

    let payload;
    try {
      payload = validateSubmission({ division: ctx.division, members: body.members || [] });
    } catch (e) {
      if (e instanceof OpenRegError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
      throw e;
    }

    // Chống trùng theo SĐT trong cùng nội dung (trạng thái đang hoạt động).
    const phones = payload.members.map((m) => m.phone_norm);
    const { data: activeRegs } = await db.from('tournament_registrations')
      .select('id').eq('division_id', divisionId).in('status', ['submitted', 'approved', 'awaiting_partner']);
    const activeIds = (activeRegs || []).map((r) => r.id);
    if (activeIds.length) {
      const { data: dupMembers } = await db.from('tournament_registration_members')
        .select('phone_norm').in('registration_id', activeIds).in('phone_norm', phones);
      if ((dupMembers || []).length) return NextResponse.json({ error: 'Số điện thoại đã đăng ký nội dung này', code: 'DUPLICATE_PHONE' }, { status: 409 });
    }

    const token = randomUUID().replace(/-/g, '');
    const status = payload.needs_partner ? 'awaiting_partner' : 'submitted';
    const { data: reg, error: regErr } = await db.from('tournament_registrations').insert({
      group_id: ctx.tournament.group_id,
      division_id: ctx.division.id,
      tournament_club_id: null,
      entrant_type: ctx.division.entrant_type,
      status,
      origin: 'public_self',
      contact_phone_norm: payload.contact_phone_norm,
      self_declared_club: body.self_declared_club || null,
      needs_partner: payload.needs_partner,
      track_token: token,
    }).select('id, status, needs_partner, track_token').single();
    if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

    const memberRows = payload.members.map((m) => ({ ...m, group_id: ctx.tournament.group_id, registration_id: reg.id }));
    const { error: mErr } = await db.from('tournament_registration_members').insert(memberRows);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    return NextResponse.json({ success: true, registration: reg, track_token: token });
  } catch (err) {
    console.error('public/registration POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
