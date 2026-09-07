import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';

const db = supabaseAdmin || supabaseServer;

// Xác thực chủ đăng ký bằng track_token; trả về bản ghi hoặc null.
async function authByToken(token) {
  if (!token) return null;
  const { data } = await db.from('tournament_registrations')
    .select('id, division_id, group_id, status, needs_partner, origin, track_token')
    .eq('track_token', token).maybeSingle();
  return data || null;
}

// POST: một VĐV solo mời một VĐV solo khác trong cùng nội dung ghép cặp.
export async function POST(request) {
  try {
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
