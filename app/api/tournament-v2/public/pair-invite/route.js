import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { consumeRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rateLimit';

const db = supabaseAdmin || supabaseServer;

// Xác thực chủ đăng ký bằng track_token; trả về bản ghi hoặc null.
async function authByToken(token) {
  if (!token) return null;
  const { data } = await db.from('tournament_registrations')
    .select('id, division_id, group_id, status, needs_partner, origin, track_token')
    .eq('track_token', token).maybeSingle();
  return data || null;
}

// Tên hiển thị gọn của một đăng ký lẻ (lấy VĐV ghế 1).
async function primaryMember(registrationId) {
  const { data } = await db.from('tournament_registration_members')
    .select('full_name, gender, self_declared_phr').eq('registration_id', registrationId).order('seat').limit(1).maybeSingle();
  return data || null;
}

// GET: bối cảnh ghép cặp cho một VĐV lẻ — danh sách VĐV lẻ khác để rủ,
// lời mời đến (cần phản hồi) và lời mời mình đã gửi. Xác thực bằng track_token.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const me = await authByToken(searchParams.get('token'));
    if (!me) return NextResponse.json({ error: 'Token không hợp lệ' }, { status: 401 });
    if (me.status !== 'awaiting_partner') {
      return NextResponse.json({ candidates: [], incoming: [], outgoing: [], status: me.status });
    }

    // Các VĐV lẻ khác trong cùng nội dung.
    const { data: others } = await db.from('tournament_registrations')
      .select('id, status').eq('division_id', me.division_id).eq('status', 'awaiting_partner').neq('id', me.id);
    const otherRows = others || [];

    // Lời mời đang chờ liên quan tới mình.
    const { data: invites } = await db.from('tournament_pair_invites')
      .select('id, from_registration_id, to_registration_id, status')
      .eq('division_id', me.division_id).eq('status', 'pending')
      .or(`from_registration_id.eq.${me.id},to_registration_id.eq.${me.id}`);
    const inviteRows = invites || [];
    const incomingByFrom = new Map();
    const outgoingTo = new Set();
    for (const inv of inviteRows) {
      if (inv.to_registration_id === me.id) incomingByFrom.set(inv.from_registration_id, inv.id);
      if (inv.from_registration_id === me.id) outgoingTo.add(inv.to_registration_id);
    }

    const candidates = [];
    for (const o of otherRows) {
      const m = await primaryMember(o.id);
      candidates.push({
        registration_id: o.id,
        name: m ? m.full_name : 'VĐV',
        gender: m ? m.gender : null,
        phr: m ? m.self_declared_phr : null,
        invited: outgoingTo.has(o.id),
      });
    }

    const incoming = [];
    for (const [fromId, inviteId] of incomingByFrom) {
      const m = await primaryMember(fromId);
      incoming.push({ invite_id: inviteId, from_registration_id: fromId, name: m ? m.full_name : 'VĐV', gender: m ? m.gender : null, phr: m ? m.self_declared_phr : null });
    }

    const outgoing = inviteRows
      .filter((inv) => inv.from_registration_id === me.id)
      .map((inv) => ({ invite_id: inv.id, to_registration_id: inv.to_registration_id }));

    return NextResponse.json({ status: me.status, candidates, incoming, outgoing });
  } catch (err) {
    console.error('public/pair-invite GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: một VĐV solo mời một VĐV solo khác trong cùng nội dung ghép cặp.
export async function POST(request) {
  try {
    const rate = consumeRateLimit(`public-pair-invite:${getClientIdentifier(request)}`, { limit: 20, windowMs: 60_000 });
    if (!rate.allowed) return rateLimitResponse(rate);
    const body = await request.json().catch(() => ({}));
    const from = await authByToken(body.track_token);
    if (!from) return NextResponse.json({ error: 'Token không hợp lệ' }, { status: 401 });
    if (from.status !== 'awaiting_partner') return NextResponse.json({ error: 'Đăng ký không ở trạng thái chờ ghép cặp' }, { status: 409 });

    const toId = body.to_registration_id;
    if (!toId || toId === from.id) return NextResponse.json({ error: 'Đối tượng mời không hợp lệ' }, { status: 400 });
    const { data: to } = await db.from('tournament_registrations')
      .select('id, division_id, status, needs_partner').eq('id', toId).eq('division_id', from.division_id).maybeSingle();
    if (!to) return NextResponse.json({ error: 'Không tìm thấy VĐV được mời' }, { status: 404 });
    if (to.status !== 'awaiting_partner') return NextResponse.json({ error: 'VĐV được mời không còn chờ ghép cặp' }, { status: 409 });

    // Không tạo trùng lời mời pending.
    const { data: dup } = await db.from('tournament_pair_invites')
      .select('id').eq('from_registration_id', from.id).eq('to_registration_id', toId).eq('status', 'pending').maybeSingle();
    if (dup) return NextResponse.json({ success: true, invite: dup });

    const { data: invite, error } = await db.from('tournament_pair_invites').insert({
      group_id: from.group_id, division_id: from.division_id,
      from_registration_id: from.id, to_registration_id: toId, status: 'pending',
    }).select('id, status').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, invite });
  } catch (err) {
    console.error('public/pair-invite POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: người được mời chấp nhận/từ chối bằng track_token của chính họ.
export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const me = await authByToken(body.track_token);
    if (!me) return NextResponse.json({ error: 'Token không hợp lệ' }, { status: 401 });
    const action = body.action;
    if (!['accept', 'decline', 'cancel'].includes(action)) return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });

    const { data: invite } = await db.from('tournament_pair_invites')
      .select('id, from_registration_id, to_registration_id, status, division_id')
      .eq('id', body.invite_id).eq('status', 'pending').maybeSingle();
    if (!invite) return NextResponse.json({ error: 'Lời mời không tồn tại hoặc đã xử lý' }, { status: 404 });

    if (action === 'cancel') {
      if (invite.from_registration_id !== me.id) return NextResponse.json({ error: 'Chỉ người gửi mới được hủy' }, { status: 403 });
      await db.from('tournament_pair_invites').update({ status: 'cancelled' }).eq('id', invite.id);
      return NextResponse.json({ success: true, status: 'cancelled' });
    }
    if (invite.to_registration_id !== me.id) return NextResponse.json({ error: 'Chỉ người được mời mới được phản hồi' }, { status: 403 });

    const next = action === 'accept' ? 'accepted' : 'declined';
    await db.from('tournament_pair_invites').update({ status: next }).eq('id', invite.id);
    return NextResponse.json({ success: true, status: next });
  } catch (err) {
    console.error('public/pair-invite PATCH error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
