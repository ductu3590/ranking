import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';

const db = supabaseAdmin || supabaseServer;

export async function POST(request) {
  try {
    const body = await request.json();
    const matchId = Number(body?.match_id ?? body?.matchId);
    const loserEntryId = Number(body?.loser_entry_id ?? body?.loserEntryId);
    const reason = String(body?.reason || '').trim();
    const idempotencyKey = String(body?.idempotency_key ?? body?.idempotencyKey ?? '').trim();
    if (!Number.isSafeInteger(matchId) || !Number.isSafeInteger(loserEntryId) || !reason || !idempotencyKey || idempotencyKey.length > 200) {
      return NextResponse.json({ error: 'match_id, loser_entry_id, lý do và idempotency_key hợp lệ là bắt buộc.', code: 'WITHDRAW_PAYLOAD_INVALID' }, { status: 400 });
    }
    const probe = await db.from('tournament_matches').select('id, stage_id').eq('id', matchId).maybeSingle();
    if (probe.error) throw probe.error;
    if (!probe.data) return NextResponse.json({ error: 'Không tìm thấy trận.', code: 'MATCH_NOT_FOUND' }, { status: 404 });
    const stage = await db.from('tournament_stages').select('id, tournament_id, division_id').eq('id', probe.data.stage_id).maybeSingle();
    if (stage.error) throw stage.error;
    if (!stage.data) return NextResponse.json({ error: 'Không tìm thấy giai đoạn.', code: 'STAGE_NOT_FOUND' }, { status: 404 });
    const access = await requireTournamentAccess({ tournamentId: stage.data.tournament_id, need: 'write' });
    if (!access.ok) return access.response;
    const { data, error } = await db.rpc('withdraw_tournament_match_walkover', {
      p_group_id: access.groupId, p_match_id: matchId, p_loser_entry_id: loserEntryId,
      p_reason: reason, p_idempotency_key: idempotencyKey,
    });
    if (error) {
      const message = error.message || 'Không thể xử lý rút lui.';
      const code = ['MATCH_ALREADY_FINALIZED', 'MATCH_ENTRY_INVALID', 'IDEMPOTENCY_KEY_REUSED', 'MATCH_VERSION_CONFLICT'].find((item) => message.includes(item)) || error.code || 'WITHDRAW_FAILED';
      return NextResponse.json({ error: message, code }, { status: code === 'MATCH_ALREADY_FINALIZED' ? 409 : 400 });
    }
    await writeOperationLog(db, { groupId: access.groupId, tournamentId: stage.data.tournament_id, divisionId: stage.data.division_id,
      actor: access.actor?.kind || 'admin', action: 'match_walkover', targetType: 'match', targetId: matchId,
      before: null, after: { result_type: 'walkover', loser_entry_id: loserEntryId, winner_entry_id: data?.winner_entry_id }, reason });
    return NextResponse.json({ success: true, ...(data || {}) });
  } catch (error) {
    console.error('Withdraw match error:', error);
    return NextResponse.json({ error: error.message || 'Không thể xử lý rút lui.', code: error.code || 'WITHDRAW_FAILED' }, { status: 500 });
  }
}