import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { previewPairing, confirmPairing } from '@/lib/tournament/interclub';
import { summarizeRosterWarnings } from '@/lib/tournament/wizardModel';
import { randomUUID } from 'crypto';

const db = supabaseAdmin || supabaseServer;

function domainError(error) {
    if (!error?.code || !/^[A-Z_]+$/.test(error.code)) return null;
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
}

function athleteLabel(row) {
    return row.display_name_snapshot || `VĐV #${row.athlete_id ?? row.id}`;
}

async function loadDivision(divisionId, groupId) {
    const { data, error } = await db
        .from('tournament_divisions')
        .select('id, tournament_id, name, play_type, pairing_mode, rating_policy, rating_cap, scoring_scope')
        .eq('id', divisionId)
        .eq('group_id', groupId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function loadAthletes(tournamentId, groupId, athleteIds) {
    let query = db
        .from('tournament_athletes')
        .select('id, tournament_club_id, athlete_id, display_name_snapshot, phr_rating, phr_status')
        .eq('group_id', groupId)
        .eq('tournament_id', tournamentId)
        .order('id', { ascending: true });
    if (Array.isArray(athleteIds) && athleteIds.length) query = query.in('id', athleteIds);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function POST(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;
        const body = await request.json();
        const divisionId = body?.division_id;
        const mode = body?.mode === 'confirm' ? 'confirm' : 'preview';
        if (!divisionId) return NextResponse.json({ error: 'division_id là bắt buộc' }, { status: 400 });

        const division = await loadDivision(divisionId, groupId);
        if (!division) return NextResponse.json({ error: 'Không tìm thấy nội dung thi đấu' }, { status: 404 });

        const rows = await loadAthletes(division.tournament_id, groupId, body?.athlete_ids);
        const byId = new Map(rows.map((row) => [String(row.id), row]));
        const athletes = rows.map((row) => ({
            id: row.id,
            tournament_athlete_id: row.id,
            display_name: athleteLabel(row),
            phr_rating: row.phr_rating == null ? null : Number(row.phr_rating),
            phr_status: row.phr_status,
            club_id: row.tournament_club_id,
        }));

        if (mode === 'preview') {
            let result;
            try {
                result = previewPairing({
                    play_type: division.play_type,
                    pairing_mode: body?.pairing_mode || division.pairing_mode,
                    athletes,
                    seed: Number(body?.seed) || 1,
                    division,
                });
            } catch (error) {
                const response = domainError(error);
                if (response) return response;
                throw error;
            }
            const summary = summarizeRosterWarnings(result.pairs, division);
            return NextResponse.json({
                pairs: result.pairs.map((pair) => ({
                    ...pair,
                    member_names: pair.members.map((member) => athleteLabel(byId.get(String(member.tournament_athlete_id)) || {})),
                })),
                unpaired: (result.unpaired || []).map((athlete) => ({ id: athlete.id, display_name: athlete.display_name })),
                warnings: result.warnings || [],
                rating_summary: summary,
                blocking: false,
            });
        }

        // Chốt ghép cặp: khóa snapshot cặp rồi tạo entry theo division.
        let locked;
        try {
            locked = confirmPairing(body?.pairs || []);
        } catch (error) {
            const response = domainError(error);
            if (response) return response;
            throw error;
        }
        if (!locked.length) return NextResponse.json({ error: 'Chưa có cặp nào để chốt' }, { status: 400 });

        const idempotencyKey = String(body.idempotency_key || body.idempotencyKey || randomUUID());
        if (idempotencyKey.length > 200) return NextResponse.json({ error: 'idempotency_key không hợp lệ' }, { status: 400 });
        const { data: atomicResult, error: atomicError } = await db.rpc('create_tournament_pairs_atomic', {
            p_group_id: groupId,
            p_division_id: Number(division.id),
            p_pairs: locked,
            p_pairing_mode: body?.pairing_mode === 'manual' || division.pairing_mode === 'manual' ? 'manual' : 'random_balanced',
            p_idempotency_key: idempotencyKey,
        });
        if (atomicError) return NextResponse.json({ error: atomicError.message }, { status: 500 });
        return NextResponse.json({ success: true, ...(atomicResult || {}) });

    } catch (err) {
        console.error('Pairings POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
