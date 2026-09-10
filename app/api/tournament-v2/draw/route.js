import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';
import { buildDrawSlots, swapDrawSlots, validateDraw } from '@/lib/tournament/draw';
import { generateAndPersistSchedule } from '@/lib/tournament/generateSchedule';

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
            .eq('division_id', stage.division_id);
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

async function saveDraw(stage, groupId, nextDraw) {
    const nextConfig = { ...(stage.config || {}), draw: nextDraw };
    const { data, error } = await db
        .from('tournament_stages')
        .update({ config: nextConfig })
        .eq('id', stage.id)
        .eq('group_id', groupId)
        .select('id, config')
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function log(access, stage, action, before, after, reason) {
    const written = await writeOperationLog(db, {
        groupId: access.groupId,
        tournamentId: stage.tournament_id,
        divisionId: stage.division_id,
        actor: access.actor || 'admin',
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
        const warnings = draw && Array.isArray(draw.slots)
            ? validateDraw(draw.slots, entrants).warnings
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
            const seed = Number(body?.seed) || Math.floor(Math.random() * 1000000) + 1;
            const nextDraw = {
                status: 'draft',
                seed,
                slots: buildDrawSlots(stage, entrants, seed),
                drawn_at: new Date().toISOString(),
                locked_at: null,
            };
            await saveDraw(stage, access.groupId, nextDraw);
            await log(access, stage, 'draw_rolled', { seed: current?.seed ?? null }, { seed });
            return NextResponse.json({
                success: true,
                draw: nextDraw,
                warnings: validateDraw(nextDraw.slots, entrants).warnings,
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
            let slots;
            try {
                slots = swapDrawSlots(current.slots, body?.entry_a, body?.entry_b);
            } catch (err) {
                return NextResponse.json({ error: err.message, code: 'DRAW_SWAP_INVALID' }, { status: 400 });
            }
            const nextDraw = { ...current, slots };
            await saveDraw(stage, access.groupId, nextDraw);
            await log(access, stage, 'draw_swapped', null, { entry_a: body?.entry_a, entry_b: body?.entry_b });
            return NextResponse.json({
                success: true,
                draw: nextDraw,
                warnings: validateDraw(slots, entrants).warnings,
            });
        }

        // ---- Chốt: nơi DUY NHẤT tạo trận ----
        if (action === 'lock') {
            if (status === 'locked') {
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
            const verdict = validateDraw(current.slots, entrants);
            if (!verdict.ok) {
                return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
            }

            // Ghi vị trí bốc thăm xuống stage_entrants để engine sinh lịch theo
            // đúng bảng/nhánh BTC đã chốt.
            const entryBased = Boolean(stage.division_id);
            const { error: clearErr } = await db
                .from('tournament_stage_entrants')
                .delete()
                .eq('group_id', access.groupId)
                .eq('stage_id', stage.id);
            if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 });

            // division_id là NOT NULL từ migration 033 nên phải ghi kèm, không chỉ entry_id.
            const rows = current.slots.map((slot) => ({
                group_id: access.groupId,
                stage_id: stage.id,
                division_id: stage.division_id,
                ...(entryBased ? { entry_id: slot.entry_id } : { entrant_id: slot.entry_id }),
                group_label: slot.group_label,
                seed_in_stage: slot.seed_in_stage,
            }));
            const { error: insertErr } = await db.from('tournament_stage_entrants').insert(rows);
            if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

            const ordered = current.slots.map((slot) => {
                const found = entrants.find((e) => String(e.id) === String(slot.entry_id)) || {};
                return { id: slot.entry_id, seed: slot.seed_in_stage, group_label: slot.group_label, club_id: found.club_id ?? null };
            });

            const result = await generateAndPersistSchedule(db, {
                stage,
                entrants: ordered,
                groupId: access.groupId,
                seed: current.seed,
                idempotencyKey: body?.idempotency_key,
            });
            if (!result.ok) {
                return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
            }

            const nextDraw = { ...current, status: 'locked', locked_at: new Date().toISOString() };
            const fresh = await loadStage(stageId, access.groupId);
            await saveDraw(fresh || stage, access.groupId, nextDraw);
            await log(access, stage, 'draw_locked', { status: 'draft' }, { status: 'locked', matchCount: result.data.matchCount });

            return NextResponse.json({ success: true, draw: nextDraw, ...result.data });
        }

        // ---- Huỷ chốt ----
        if (action === 'unlock') {
            const reason = String(body?.reason || '').trim();
            if (status !== 'locked') {
                return NextResponse.json({
                    error: 'Bốc thăm chưa chốt nên không có gì để huỷ.',
                    code: 'DRAW_NOT_LOCKED',
                }, { status: 409 });
            }
            if (!reason) {
                return NextResponse.json({
                    error: 'Huỷ chốt sẽ xoá toàn bộ lịch đã sinh. Phải nói rõ lý do.',
                    code: 'REASON_REQUIRED',
                }, { status: 400 });
            }
            const played = await countPlayedMatches(stage.id, access.groupId);
            if (played > 0) {
                return NextResponse.json({
                    error: `Giai đoạn đã có ${played} trận bắt đầu hoặc đã xong. Không huỷ chốt được — sửa kết quả phải qua nhật ký chỉnh sửa.`,
                    code: 'DRAW_HAS_PLAYED_MATCHES',
                }, { status: 409 });
            }

            const { error: delErr } = await db
                .from('tournament_matches')
                .delete()
                .eq('group_id', access.groupId)
                .eq('stage_id', stage.id);
            if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

            const nextDraw = { ...current, status: 'draft', locked_at: null };
            await saveDraw(stage, access.groupId, nextDraw);
            await log(access, stage, 'draw_unlocked', { status: 'locked' }, { status: 'draft' }, reason);
            return NextResponse.json({ success: true, draw: nextDraw });
        }

        return NextResponse.json({ error: 'action không hợp lệ', code: 'INVALID_ACTION' }, { status: 400 });
    } catch (err) {
        console.error('Draw POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
