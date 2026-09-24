import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';
import { assertWithdrawAllowed, classifyRpcConflict } from '@/lib/tournament/scoreEntry';

const db = supabaseAdmin || supabaseServer;

// W.O. (cặp không ra sân) và bỏ cuộc (giữa trận) cùng đi RPC 096 — một transaction: thay ván bằng W.O.
// BO tối thiểu, chốt, tiến cấp người thắng, result_type = 'walkover'. Không UPDATE result_type ngoài RPC.
// Nhật ký phân biệt hai trường hợp bằng action (spec Epic 2, Lát E1 §6.4).
export async function POST(request) {
  try {
    const body = await request.json();
    const matchId = Number(body?.match_id ?? body?.matchId);
    const loserEntryId = Number(body?.loser_entry_id ?? body?.loserEntryId);
    const reason = String(body?.reason || '').trim();
    const idempotencyKey = String(body?.idempotency_key ?? body?.idempotencyKey ?? '').trim();
    const kind = body?.kind === 'retired' ? 'retired' : 'walkover';
    if (!Number.isSafeInteger(matchId) || !Number.isSafeInteger(loserEntryId) || !reason || !idempotencyKey || idempotencyKey.length > 200) {
      return NextResponse.json({ error: 'match_id, loser_entry_id, lý do và idempotency_key hợp lệ là bắt buộc.', code: 'WITHDRAW_PAYLOAD_INVALID' }, { status: 400 });
    }
    const probe = await db.from('tournament_matches').select('id, group_id, stage_id, status, entry_a_id, entry_b_id').eq('id', matchId).maybeSingle();
    if (probe.error) throw probe.error;
    if (!probe.data) return NextResponse.json({ error: 'Không tìm thấy trận.', code: 'MATCH_NOT_FOUND' }, { status: 404 });
    const stage = await db.from('tournament_stages').select('id, tournament_id, division_id').eq('id', probe.data.stage_id).eq('group_id', probe.data.group_id).maybeSingle();
    if (stage.error) throw stage.error;
    if (!stage.data) return NextResponse.json({ error: 'Không tìm thấy giai đoạn.', code: 'STAGE_NOT_FOUND' }, { status: 404 });
    const access = await requireTournamentAccess({ tournamentId: stage.data.tournament_id, need: 'write' });
    if (!access.ok) return access.response;
    if (String(probe.data.group_id) !== String(access.groupId)) {
      return NextResponse.json({ error: 'Không tìm thấy trận.', code: 'MATCH_NOT_FOUND' }, { status: 404 });
    }
    // RPC 096 chỉ chặn trận đã chốt; trạng thái hợp lệ cho từng loại kiểm ở đây.
    const verdict = assertWithdrawAllowed({ match: probe.data, kind });
    if (!verdict.ok) return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: verdict.status });
    const { data, error } = await db.rpc('withdraw_tournament_match_walkover', {
      p_group_id: access.groupId, p_match_id: matchId, p_loser_entry_id: loserEntryId,
      p_reason: reason, p_idempotency_key: idempotencyKey,
    });
    if (error) {
      const conflict = classifyRpcConflict(error);
      if (conflict) return NextResponse.json({ error: conflict.message, code: conflict.code }, { status: conflict.status });
      const message = error.message || 'Không thể xử lý rút lui.';
      const code = ['MATCH_ENTRY_INVALID', 'IDEMPOTENCY_KEY_REUSED', 'WITHDRAW_PAYLOAD_INVALID'].find((item) => message.includes(item)) || error.code || 'WITHDRAW_FAILED';
      return NextResponse.json({ error: message, code }, { status: 400 });
    }
    // ended_at: RPC không ghi. UPDATE có điều kiện, không tăng version (spec E1 §6.3).
    if (Number.isInteger(Number(data?.version))) {
      const stamp = await db.from('tournament_matches').update({ ended_at: new Date().toISOString() })
        .eq('id', matchId).eq('group_id', access.groupId).eq('status', 'finalized')
        .eq('version', Number(data.version)).is('ended_at', null);
      if (stamp.error) console.error('Stamp ended_at failed:', stamp.error);
    }
    await writeOperationLog(db, { groupId: access.groupId, tournamentId: stage.data.tournament_id, divisionId: stage.data.division_id,
      actor: access.actor?.kind || 'admin', action: verdict.action, targetType: 'match', targetId: matchId,
      before: { status: probe.data.status }, after: { result_type: 'walkover', loser_entry_id: loserEntryId, winner_entry_id: data?.winner_entry_id }, reason });
    return NextResponse.json({ success: true, ...(data || {}) });
  } catch (error) {
    console.error('Withdraw match error:', error);
    return NextResponse.json({ error: error.message || 'Không thể xử lý rút lui.', code: error.code || 'WITHDRAW_FAILED' }, { status: 500 });
  }
}
