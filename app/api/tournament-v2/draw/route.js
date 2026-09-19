import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';
import { buildDrawSlots, swapDrawSlots, validateDraw } from '@/lib/tournament/draw';
import { generateAndPersistSchedule } from '@/lib/tournament/generateSchedule';
import { snapshotStageRules } from '@/lib/tournament/stageRulesSnapshot';
import { saveDrawSnapshot } from '@/lib/tournament/saveDraw';
import { randomUUID } from 'crypto';
import { actorName } from '@/lib/tournament/actorName';

// Xung dot nghiep vu nay ERRCODE 'PH409' (migration 078). Truoc day dung 40001,
// nhung 40001 la serialization_failure nen tang tren tu dong retry va request treo.
const CONFLICT_CODES = ['PH409', '40001'];

const db = supabaseAdmin || supabaseServer;

// Trận đã bắt đầu hoặc đã xong thì không huỷ chốt bốc thăm được nữa.
const PLAYED = ['warmup', 'live', 'paused', 'finalized'];

async function loadStage(stageId, groupId) {
    let query = db
        .from('tournament_stages')
        .select('id, tournament_id, division_id, name, schedule_format, match_format, status, config')
        .eq('id', stageId);
    if (groupId != null) query = query.eq('group_id', groupId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
}

// Danh sách đội của giai đoạn. Lấy đúng cách generate/route.js đang làm để hai
// đường không cho ra tập đội khác nhau.
async function loadEntrants(stage, groupId) {
    const { data: stageEntrants, error: seErr } = await db
        .from('tournament_stage_entrants')
        .select('entry_id, entrant_id, seed_in_stage, group_label')
        .eq('group_id', groupId)
        .eq('stage_id', stage.id);
    if (seErr) throw seErr;

    if (stage.division_id) {
        // Cột CLB ở bảng này tên là tournament_club_id, không phải club_id.
        // Dùng để cảnh báo hai đội cùng CLB rơi chung một bảng.
        const { data: entries, error } = await db
            .from('tournament_entries')
            .select('id, seed, tournament_club_id, name_snapshot')
            .eq('group_id', groupId)
            .eq('division_id', stage.division_id)
            .eq('status', 'approved');
        if (error) throw error;
        // UI bốc thăm đọc `name`; thiếu nó thì màn hình chỉ hiện "Đội #id".
        return (entries || []).map((r) => ({
            id: r.id,
            seed: r.seed,
            club_id: r.tournament_club_id ?? null,
            name: r.name_snapshot || null,
        }));
    }

    if (stageEntrants && stageEntrants.length) {
        const ids = stageEntrants.map((r) => r.entrant_id).filter((id) => id != null);
        let nameById = {};
        if (ids.length) {
            const { data: named, error: nameErr } = await db
                .from('tournament_entrants')
                .select('id, name')
                .eq('group_id', groupId)
                .in('id', ids);
            if (nameErr) throw nameErr;
            nameById = Object.fromEntries((named || []).map((r) => [String(r.id), r.name]));
        }
        return stageEntrants.map((r) => ({
            id: r.entrant_id,
            seed: r.seed_in_stage,
            club_id: null,
            name: nameById[String(r.entrant_id)] || null,
        }));
    }

    const { data: tEntrants, error: teErr } = await db
        .from('tournament_entrants')
        .select('id, seed, name')
        .eq('group_id', groupId)
        .eq('tournament_id', stage.tournament_id);
    if (teErr) throw teErr;
    return (tEntrants || []).map((r) => ({ id: r.id, seed: r.seed, club_id: null, name: r.name || null }));
}

async function countPlayedMatches(stageId, groupId) {
    const { count, error } = await db
        .from('tournament_matches')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('stage_id', stageId)
        .in('status', PLAYED);
    if (error) throw error;
    return Number(count || 0);
}

function drawOf(stage) {
    return (stage.config || {}).draw || null;
}

async function drawValidationOptions(stage, groupId) {
    const { data, error } = await db.from('tournaments')
        .select('settings')
        .eq('group_id', groupId)
        .eq('id', stage.tournament_id)
        .maybeSingle();
    if (error) throw error;
    return { stage, organizerMode: data?.settings?.organizer_mode };
}

async function loadSetupReadiness(stage, groupId) {
    if (!stage.division_id) return null;
    const { data, error } = await db.rpc('get_tournament_division_readiness', {
        p_group_id: Number(groupId),
        p_tournament_id: Number(stage.tournament_id),
        p_division_id: Number(stage.division_id),
    });
    if (error) throw error;
    return data;
}

function setupBlockedResponse(readiness) {
    return NextResponse.json({
        error: 'Thiết lập nội dung chưa sẵn sàng để bốc thăm.',
        code: 'SETUP_NOT_READY',
        readiness,
    }, { status: 409 });
}

async function saveDraw(stage, groupId, nextDraw) {
    return saveDrawSnapshot(db, stage, groupId, nextDraw);
}

async function log(access, stage, action, before, after, reason) {
    const written = await writeOperationLog(db, {
        groupId: access.groupId,
        tournamentId: stage.tournament_id,
        divisionId: stage.division_id,
        actor: actorName(access),
        action,
        targetType: 'stage',
        targetId: stage.id,
        before,
        after,
        reason: reason || null,
    });
    if (!written.ok) console.error('Ghi nhật ký bốc thăm lỗi:', written.error);
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const stageId = searchParams.get('stageId');
        if (!stageId) return NextResponse.json({ error: 'stageId là bắt buộc' }, { status: 400 });

        const probe = await loadStage(stageId, null);
        if (!probe) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });
        const access = await requireTournamentAccess({ tournamentId: probe.tournament_id, need: 'read' });
        if (!access.ok) return access.response;

        const stage = await loadStage(stageId, access.groupId);
        if (!stage) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });

        const entrants = await loadEntrants(stage, access.groupId);
        const draw = drawOf(stage);
        const validationOptions = await drawValidationOptions(stage, access.groupId);
        const warnings = draw && Array.isArray(draw.slots)
            ? validateDraw(draw.slots, entrants, validationOptions).warnings
            : [];

        return NextResponse.json({
            stage: {
                id: stage.id,
                name: stage.name,
                schedule_format: stage.schedule_format,
                division_id: stage.division_id,
            },
            entrants,
            draw: draw || { status: 'none', slots: [] },
            warnings,
            played_matches: await countPlayedMatches(stage.id, access.groupId),
        });
    } catch (err) {
        console.error('Draw GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const stageId = body?.stage_id;
        const action = body?.action;
        if (!stageId || !action) {
            return NextResponse.json({ error: 'stage_id và action là bắt buộc' }, { status: 400 });
        }

        const probe = await loadStage(stageId, null);
        if (!probe) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });
        const access = await requireTournamentAccess({ tournamentId: probe.tournament_id, need: 'write' });
        if (!access.ok) return access.response;

        const stage = await loadStage(stageId, access.groupId);
        if (!stage) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });

        const entrants = await loadEntrants(stage, access.groupId);
        const current = drawOf(stage);
        const validationOptions = await drawValidationOptions(stage, access.groupId);
        const status = current ? current.status : 'none';

        // ---- Bốc / bốc lại ----
        if (action === 'roll') {
            if (status === 'locked') {
                return NextResponse.json({
                    error: 'Bốc thăm đã chốt và đã sinh lịch. Huỷ chốt trước nếu muốn bốc lại.',
                    code: 'DRAW_ALREADY_LOCKED',
                }, { status: 409 });
            }
            if (entrants.length < 2) {
                return NextResponse.json({
                    error: 'Cần ít nhất 2 đội mới bốc thăm được.',
                    code: 'DRAW_TOO_FEW_ENTRIES',
                }, { status: 400 });
            }
            const readiness = await loadSetupReadiness(stage, access.groupId);
            if (readiness?.status !== 'ready') return setupBlockedResponse(readiness);
            const seed = Number(body?.seed) || Math.floor(Math.random() * 1000000) + 1;
            let slots;
            try {
                slots = buildDrawSlots(stage, entrants, seed);
            } catch (err) {
                return NextResponse.json({ error: 'Cấu hình số bảng không hợp lệ. Hãy kiểm tra lại trước khi bốc thăm.', code: err.message }, { status: 400 });
            }
            const nextDraw = {
                status: 'draft',
                seed,
                slots,
                drawn_at: new Date().toISOString(),
                locked_at: null,
            };
            const verdict = validateDraw(nextDraw.slots, entrants, validationOptions);
            if (!verdict.ok) return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
            await saveDraw(stage, access.groupId, nextDraw);
            await log(access, stage, 'draw_rolled', { seed: current?.seed ?? null }, { seed });
            return NextResponse.json({
                success: true,
                draw: nextDraw,
                warnings: verdict.warnings,
            });
        }

        // ---- Đổi chỗ hai đội ----
        if (action === 'swap') {
            if (status !== 'draft') {
                return NextResponse.json({
                    error: status === 'locked'
                        ? 'Bốc thăm đã chốt, không đổi chỗ được nữa. Huỷ chốt trước.'
                        : 'Chưa bốc thăm nên chưa có gì để đổi chỗ.',
                    code: 'DRAW_NOT_DRAFT',
                }, { status: 409 });
            }
            const readiness = await loadSetupReadiness(stage, access.groupId);
            if (readiness?.status !== 'ready') return setupBlockedResponse(readiness);
            let slots;
            try {
                slots = swapDrawSlots(current.slots, body?.entry_a, body?.entry_b);
            } catch (err) {
                return NextResponse.json({ error: err.message, code: 'DRAW_SWAP_INVALID' }, { status: 400 });
            }
            const nextDraw = { ...current, slots };
            const verdict = validateDraw(slots, entrants, validationOptions);
            if (!verdict.ok) return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
            await saveDraw(stage, access.groupId, nextDraw);
            await log(access, stage, 'draw_swapped', null, { entry_a: body?.entry_a, entry_b: body?.entry_b });
            return NextResponse.json({
                success: true,
                draw: nextDraw,
                warnings: verdict.warnings,
            });
        }

        // ---- Chốt: nơi DUY NHẤT tạo trận ----
        if (action === 'lock') {
            if (status === 'locked') {
                if (body?.idempotency_key && current.finalize_key === body.idempotency_key && current.finalize_result) {
                    return NextResponse.json(current.finalize_result);
                }
                return NextResponse.json({
                    error: 'Bốc thăm đã chốt rồi.',
                    code: 'DRAW_ALREADY_LOCKED',
                }, { status: 409 });
            }
            if (status !== 'draft') {
                return NextResponse.json({
                    error: 'Chưa bốc thăm nên chưa chốt được.',
                    code: 'DRAW_NOT_DRAFT',
                }, { status: 409 });
            }
            const readiness = await loadSetupReadiness(stage, access.groupId);
            if (readiness?.status !== 'ready') return setupBlockedResponse(readiness);
            const verdict = validateDraw(current.slots, entrants, validationOptions);
            if (!verdict.ok) {
                return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
            }

            const ordered = current.slots.map((slot) => {
                const found = entrants.find((e) => String(e.id) === String(slot.entry_id)) || {};
                return { id: slot.entry_id, seed: slot.seed_in_stage, group_label: slot.group_label, club_id: found.club_id ?? null };
            });

            // Chốt lịch = chốt luôn luật điểm và tie-break đang hiệu lực vào
            // giai đoạn. Nếu không, BTC đổi cấu hình giữa giải sẽ làm bảng xếp
            // hạng đổi theo trong khi suất vòng sau đã cố định — đúng điều guard
            // E5 cấm. `p_expected_config` bên dưới dùng chính config vừa chốt.
            const rulesSnapshot = await snapshotStageRules(db, stage, access.groupId);
            if (!rulesSnapshot.ok) {
                return NextResponse.json(
                    { error: rulesSnapshot.error, code: rulesSnapshot.code },
                    { status: rulesSnapshot.code === 'STAGE_CONFIG_CHANGED' ? 409 : 500 },
                );
            }
            stage.config = rulesSnapshot.stage.config;

            const result = await generateAndPersistSchedule(db, {
                stage,
                entrants: ordered,
                groupId: access.groupId,
                seed: current.seed,
                idempotencyKey: body?.idempotency_key,
                finalizeDraw: true,
            });
            if (!result.ok) {
                return NextResponse.json({ error: result.error, code: result.code }, { status: CONFLICT_CODES.includes(result.code) ? 409 : 400 });
            }

            const nextDraw = result.data.draw;
            await log(access, stage, 'draw_locked', { status: 'draft' }, { status: 'locked', matchCount: result.data.matchCount });

            return NextResponse.json({ success: true, draw: nextDraw, ...result.data });
        }

        // ---- Huỷ chốt ----
        if (action === 'unlock') {
            const reason = String(body?.reason || '').trim();
            if (!reason) {
                return NextResponse.json({
                    error: 'Huỷ chốt sẽ xoá toàn bộ lịch đã sinh. Phải nói rõ lý do.',
                    code: 'REASON_REQUIRED',
                }, { status: 400 });
            }
            const idempotencyKey = String(body?.idempotency_key || body?.idempotencyKey || randomUUID()).trim();
            if (!idempotencyKey || idempotencyKey.length > 200) {
                return NextResponse.json({ error: 'idempotency_key không hợp lệ', code: 'INVALID_IDEMPOTENCY_KEY' }, { status: 400 });
            }
            const { data, error } = await db.rpc('unlock_tournament_draw', {
                p_group_id: access.groupId,
                p_stage_id: stage.id,
                // Giữ đúng snapshot nullable cho CAS `IS DISTINCT FROM` ở RPC.
                p_expected_config: stage.config,
                p_reason: reason,
                p_idempotency_key: idempotencyKey,
            });
            if (error) {
                return NextResponse.json({ error: error.message, code: error.code }, { status: CONFLICT_CODES.includes(error.code) ? 409 : 400 });
            }
            const nextDraw = data?.draw;
            try {
                await log(access, stage, 'draw_unlocked', { status: 'locked' }, { status: 'draft' }, reason);
            } catch (logError) {
                // RPC has committed. Do not tell the client it failed and trigger a duplicate retry.
                console.error('Draw unlock audit log failed:', logError);
            }
            return NextResponse.json({ success: true, ...(data || {}), draw: nextDraw });
        }

        return NextResponse.json({ error: 'action không hợp lệ', code: 'INVALID_ACTION' }, { status: 400 });
    } catch (err) {
        console.error('Draw POST error:', err);
        return NextResponse.json({ error: err.message, code: err.code }, { status: CONFLICT_CODES.includes(err.code) ? 409 : 500 });
    }
}
