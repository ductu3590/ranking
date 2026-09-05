import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { issueScorekeeperToken } from '@/lib/tournament/scorekeeperToken';

const db = supabaseAdmin || supabaseServer;

export async function POST(request) {
    const admin = await requireValidatedGroupAdmin();
    if (!admin.ok) return admin.response;
    const body = await request.json();
    const matchId = Number(body?.match_id || body?.matchId);
    if (!Number.isInteger(matchId)) return NextResponse.json({ error: 'match_id is required' }, { status: 400 });
    const { data: match, error: matchError } = await db.from('tournament_matches')
        .select('id, tournament_id, stage_id, group_id').eq('id', matchId).eq('group_id', admin.groupId).single();
    if (matchError || !match) return NextResponse.json({ error: 'Match không tồn tại' }, { status: 404 });
    const ttl = Math.min(Math.max(Number(body?.ttl_ms) || 2 * 60 * 60 * 1000, 60_000), 24 * 60 * 60 * 1000);
    const issued = issueScorekeeperToken({ tournament_id: match.tournament_id, stage_id: match.stage_id, match_id: match.id, court: body?.court || null, ttl_ms: ttl });
    const { error } = await db.from('tournament_scorekeeper_tokens').insert({
        group_id: match.group_id, tournament_id: match.tournament_id, stage_id: match.stage_id,
        match_id: match.id, court: body?.court || null, token_hash: issued.record.token_hash,
        expires_at: new Date(issued.record.expires_at).toISOString(),
    });
    if (error) return NextResponse.json({ error: 'Không tạo được scorekeeper token' }, { status: 500 });
    return NextResponse.json({ token: issued.raw_token, expires_at: issued.record.expires_at, match_id: match.id });
}

export async function DELETE(request) {
    const admin = await requireValidatedGroupAdmin();
    if (!admin.ok) return admin.response;
    const id = String(new URL(request.url).searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const { error } = await db.from('tournament_scorekeeper_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('group_id', admin.groupId);
    if (error) return NextResponse.json({ error: 'Không thu hồi được token' }, { status: 500 });
    return NextResponse.json({ revoked: true });
}
