import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';
import { requirePlatformAdmin } from '@/lib/platformSession';
import { assertTournamentOrganizer } from '@/lib/tournament/interclub';
import { resolveOrganizerPayload } from '@/lib/tournament/wizardModel';
import { canTransition, isStatus, canDelete, groupOf } from '@/lib/tournament/lifecycle';
import { writeOperationLog } from '@/lib/tournament/operationLog';
import { finalStandingsFrom } from '@/lib/tournament/qualification';
import { computeStageStandings } from '@/lib/tournament/standingsService';

const db = supabaseAdmin || supabaseServer;

const ALLOWED_TOURNAMENT_FIELDS = [
    'name',
    'description',
    'event_date',
    'status',
    'location',
    'entrant_type',
    'visibility',
    'settings',
    'default_scoring',
    'tiebreak_policy',
];

const JSON_POLICY_FIELDS = new Set(['default_scoring', 'tiebreak_policy']);

const VISIBILITIES = new Set(['private', 'unlisted', 'public']);

function buildTournamentPayload(body, groupId) {
    const payload = {};
    for (const field of ALLOWED_TOURNAMENT_FIELDS) {
        if (!(field in body)) continue;
        if (['name', 'description', 'location'].includes(field)) {
            payload[field] = String(body[field] || '').trim() || null;
        } else if (field === 'entrant_type') {
            payload[field] = body[field] || 'pair';
        } else if (field === 'settings' || JSON_POLICY_FIELDS.has(field)) {
            payload[field] = body[field] || {};
        } else if (field === 'visibility') {
            payload[field] = body[field] || null;
        } else {
            payload[field] = body[field] || null;
        }
    }

    if (groupId) {
        payload.group_id = groupId;
    }
    payload.updated_at = new Date().toISOString();
    return payload;
}

function slugify(name) {
    return String(name || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function generateSlug(name) {
    const base = slugify(name) || 'giai';
    const suffix = randomBytes(9).toString('hex');
    return `${base}-${suffix}`;
}

// Giải cộng đồng là phạm vi toàn hệ thống. group_id vẫn NOT NULL trong giai
// đoạn chuyển tiếp nên phải trỏ vào CLB hệ thống PickHub, không được mượn CLB
// tham dự làm tenant (migration 031 chặn trường hợp này).
async function resolveSystemGroupId() {
    const configured = Number(process.env.PICKHUB_SYSTEM_GROUP_ID);
    if (Number.isInteger(configured) && configured > 0) return configured;
    const { data, error } = await db
        .from('groups')
        .select('id, name, code')
        .or('name.ilike.%pickhub%,name.ilike.%system%,code.ilike.%system%')
        .order('id')
        .limit(1);
    if (error || !data || !data.length) return null;
    return data[0].id;
}

function buildOrganizerFields(body, clubId) {
    const mode = body?.organizer_mode || (body?.organizer_type === 'community' ? 'community' : 'internal');
    const resolved = resolveOrganizerPayload(mode, { clubId });
    const { organizer_mode: organizerMode, invites_clubs: invitesClubs, open_registration: openRegistration, requires_platform_session: requiresPlatform, ...organizer } = resolved;
    assertTournamentOrganizer(organizer);
    return {
        organizer,
        settings: {
            ...(body?.settings || {}),
            organizer_mode: organizerMode,
            invites_clubs: invitesClubs,
            open_registration: openRegistration,
        },
        requiresPlatform,
    };
}

async function countMatchesByStatus(tournamentId, groupId) {
    const { data: stages, error: stageErr } = await db
        .from('tournament_stages')
        .select('id')
        .eq('group_id', groupId)
        .eq('tournament_id', tournamentId);
    if (stageErr) throw stageErr;
    const stageIds = (stages || []).map((s) => s.id);
    if (stageIds.length === 0) return { total: 0, finalized: 0, played: 0 };

    const { data: matches, error: matchErr } = await db
        .from('tournament_matches')
        .select('status')
        .eq('group_id', groupId)
        .in('stage_id', stageIds);
    if (matchErr) throw matchErr;

    const rows = matches || [];
    return {
        total: rows.length,
        finalized: rows.filter((m) => m.status === 'finalized').length,
        played: rows.filter((m) => m.status === 'live' || m.status === 'finalized').length,
    };
}

async function countApprovedRegistrations(tournamentId, groupId) {
    const { data: divisions, error: divErr } = await db
        .from('tournament_divisions')
        .select('id')
        .eq('group_id', groupId)
        .eq('tournament_id', tournamentId);
    if (divErr) throw divErr;
    const divisionIds = (divisions || []).map((d) => d.id);
    if (divisionIds.length === 0) return 0;

    const { count, error } = await db
        .from('tournament_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .in('division_id', divisionIds)
        .eq('status', 'approved');
    if (error) throw error;
    return Number(count || 0);
}

async function checkTransitionGuards(guards, tournamentId, groupId) {
    if (guards.length === 0) return null;
    const counts = await countMatchesByStatus(tournamentId, groupId);

    if (guards.includes('all_matches_finalized') && counts.total !== counts.finalized) {
        const open = counts.total - counts.finalized;
        return NextResponse.json({
            error: `Còn ${open} trận chưa chốt kết quả. Chốt hết rồi mới kết thúc giải được.`,
            code: 'TOURNAMENT_HAS_OPEN_MATCHES',
            open_matches: open,
        }, { status: 409 });
    }
    if (guards.includes('no_played_matches') && counts.played > 0) {
        return NextResponse.json({
            error: `Giải đã có ${counts.played} trận đang đấu hoặc đã đấu xong, không quay về Nháp được.`,
            code: 'TOURNAMENT_HAS_PLAYED_MATCHES',
        }, { status: 409 });
    }
    if (guards.includes('no_finalized_matches') && counts.finalized > 0) {
        return NextResponse.json({
            error: `Giải đã có ${counts.finalized} trận chốt kết quả, không quay về Đã chốt lịch được.`,
            code: 'TOURNAMENT_HAS_FINALIZED_MATCHES',
        }, { status: 409 });
    }
    if (guards.includes('no_approved_registrations')) {
        const approved = await countApprovedRegistrations(tournamentId, groupId);
        if (approved > 0) {
            return NextResponse.json({
                error: `Giải đã có ${approved} đăng ký được duyệt. Quay về Nháp sẽ ẩn giải khỏi trang công khai và các VĐV này mất chỗ.`,
                code: 'TOURNAMENT_HAS_APPROVED_REGISTRATIONS',
                approved_registrations: approved,
            }, { status: 409 });
        }
    }
    return null;
}

function organizerModeForList(tournament) {
    const configured = tournament?.settings?.organizer_mode;
    if (['internal', 'friendly', 'community'].includes(configured)) return configured;
    if (tournament?.organizer_type === 'community') return 'community';
    return 'internal';
}

// Hạng chung cuộc là dữ kiện lịch sử: ghi sau khi chốt giải, nhưng lỗi ghi hạng
// không được đảo ngược trạng thái completed đã lưu thành công.
async function writeFinalStandings(tournamentId, groupId) {
    const { data: divisions, error: divErr } = await db
        .from('tournament_divisions').select('id').eq('group_id', groupId).eq('tournament_id', tournamentId);
    if (divErr) throw divErr;
    for (const division of divisions || []) {
        const { data: stages, error: stageErr } = await db
            .from('tournament_stages').select('*').eq('group_id', groupId).eq('division_id', division.id)
            .order('stage_order', { ascending: false }).limit(1);
        if (stageErr) throw stageErr;
        const stage = stages?.[0];
        if (!stage) continue;
        const result = await computeStageStandings(db, stage, groupId);
        const final_standings = finalStandingsFrom(stage, result.standings, result.matches);
        const { error: updateErr } = await db.from('tournament_divisions')
            .update({ final_standings }).eq('id', division.id).eq('group_id', groupId);
        if (updateErr) throw updateErr;
    }
}

function normalizeVisibility(value, fallback) {
    const visibility = value == null || value === '' ? fallback : String(value).trim().toLowerCase();
    return VISIBILITIES.has(visibility) ? visibility : null;
}

async function insertWithSlugRetry(payload) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await db.from('tournaments').insert(payload).select().single();
        if (!error) return { data, error: null };
        if (error.code !== '23505' || attempt === 2) return { data: null, error };
        payload = { ...payload, public_slug: generateSlug(payload.name) };
    }
    return { data: null, error: new Error('Unable to generate a unique public slug') };
}

export async function GET() {
    try {
        const scope = getClubScope();
        if (!scope.ok) return scope.response;
        const groupId = scope.groupId;

        const { data, error } = await db
            .from('tournaments')
            .select('*')
            .eq('group_id', groupId)
            .order('event_date', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const tournaments = (data || []).map((t) => ({
            ...t,
            group: groupOf(t.status),
            match_progress: null,
        }));

        if (tournaments.length === 0) {
            return NextResponse.json({ tournaments: [] });
        }

        const ids = tournaments.map((t) => t.id);
        const { data: stages, error: stageErr } = await db
            .from('tournament_stages')
            .select('id, tournament_id, schedule_format, match_format')
            .eq('group_id', groupId)
            .in('tournament_id', ids);
        if (stageErr) {
            return NextResponse.json({ error: stageErr.message }, { status: 500 });
        }

        const stageIds = (stages || []).map((s) => s.id);
        const byTournament = new Map();
        for (const stage of stages || []) {
            const current = byTournament.get(stage.tournament_id) || [];
            current.push(stage.id);
            byTournament.set(stage.tournament_id, current);
        }

        let matches = [];
        if (stageIds.length > 0) {
            const { data: rowMatches, error: matchErr } = await db
                .from('tournament_matches')
                .select('stage_id, status')
                .eq('group_id', groupId)
                .in('stage_id', stageIds);
            if (matchErr) {
                return NextResponse.json({ error: matchErr.message }, { status: 500 });
            }
            matches = rowMatches || [];
        }

        const { data: divisions, error: divisionErr } = await db
            .from('tournament_divisions')
            .select('id, tournament_id, capacity, registration_capacity')
            .eq('group_id', groupId)
            .in('tournament_id', ids);
        if (divisionErr) {
            return NextResponse.json({ error: divisionErr.message }, { status: 500 });
        }

        const divisionRows = divisions || [];
        const divisionIds = divisionRows.map((division) => division.id);
        let registrations = [];
        if (divisionIds.length > 0) {
            const { data: rows, error: registrationErr } = await db
                .from('tournament_registrations')
                .select('division_id, status')
                .eq('group_id', groupId)
                .in('division_id', divisionIds);
            if (registrationErr) {
                return NextResponse.json({ error: registrationErr.message }, { status: 500 });
            }
            registrations = rows || [];
        }

        const divisionToTournament = new Map(divisionRows.map((division) => [division.id, division.tournament_id]));
        const registrationSummaryByTournament = new Map();
        for (const division of divisionRows) {
            const current = registrationSummaryByTournament.get(division.tournament_id) || {
                approved: 0,
                submitted: 0,
                capacity: 0,
                hasUnlimitedDivision: false,
                divisionCount: 0,
            };
            const capacity = division.registration_capacity ?? division.capacity;
            current.divisionCount += 1;
            if (capacity == null) current.hasUnlimitedDivision = true;
            else current.capacity += Number(capacity || 0);
            registrationSummaryByTournament.set(division.tournament_id, current);
        }
        for (const registration of registrations) {
            const tournamentId = divisionToTournament.get(registration.division_id);
            const current = registrationSummaryByTournament.get(tournamentId);
            if (!current) continue;
            if (registration.status === 'approved') current.approved += 1;
            if (registration.status === 'submitted') current.submitted += 1;
        }

        const countsByTournament = new Map();
        for (const match of matches) {
            const tournamentId = (stages || []).find((s) => s.id === match.stage_id)?.tournament_id;
            if (tournamentId == null) continue;
            const current = countsByTournament.get(tournamentId) || { total: 0, finalized: 0 };
            current.total += 1;
            if (match.status === 'finalized') current.finalized += 1;
            countsByTournament.set(tournamentId, current);
        }

        const enriched = tournaments.map((t) => {
            const value = countsByTournament.get(t.id);
            const registration = registrationSummaryByTournament.get(t.id);
            const formats = Array.from(new Set(
                (stages || [])
                    .filter((stage) => stage.tournament_id === t.id)
                    .map((stage) => `${stage.schedule_format}:${stage.match_format}`),
            )).map((value) => {
                const [schedule_format, match_format] = value.split(':');
                return { schedule_format, match_format };
            });
            const registration_summary = registration ? {
                approved: registration.approved,
                submitted: registration.submitted,
                capacity: registration.hasUnlimitedDivision ? null : registration.capacity,
                division_count: registration.divisionCount,
            } : null;
            if (!value || value.total === 0) {
                return {
                    ...t,
                    organizer_mode: organizerModeForList(t),
                    formats,
                    registration_summary,
                    match_progress: null,
                };
            }
            const total = value.total;
            const finalized = value.finalized;
            return {
                ...t,
                organizer_mode: organizerModeForList(t),
                formats,
                registration_summary,
                match_progress: {
                    total,
                    finalized,
                    percent: Math.round((finalized / total) * 100),
                },
            };
        });

        return NextResponse.json({ tournaments: enriched });
    } catch (err) {
        console.error('Tournaments v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const name = body.name?.trim();
        const requestedMode = body.organizer_mode || (body.organizer_type === 'community' ? 'community' : 'internal');
        const isCommunity = requestedMode === 'community';

        // Giải cộng đồng dùng platform_session; giải CLB dùng group_session.
        // Không bao giờ giả lập quyền hệ thống bằng phiên CLB.
        let tenantGroupId = null;
        let platformAccountId = null;
        if (isCommunity) {
            const platformCheck = await requirePlatformAdmin();
            if (!platformCheck.ok) {
                return NextResponse.json({
                    error: 'Cần đăng nhập tài khoản quản trị cộng đồng để tạo giải cộng đồng.',
                    code: 'PLATFORM_SESSION_REQUIRED',
                }, { status: 401 });
            }
            platformAccountId = platformCheck.session?.account_id ?? platformCheck.session?.id ?? null;
            tenantGroupId = await resolveSystemGroupId();
            if (!tenantGroupId) {
                return NextResponse.json({
                    error: 'Chưa cấu hình CLB hệ thống PickHub cho giải cộng đồng. Đặt PICKHUB_SYSTEM_GROUP_ID trước khi tạo.',
                    code: 'SYSTEM_GROUP_REQUIRED',
                }, { status: 409 });
            }
        } else {
            const adminCheck = await requireValidatedGroupAdmin();
            if (!adminCheck.ok) return adminCheck.response;
            tenantGroupId = adminCheck.groupId;
        }

        if (!name) {
            return NextResponse.json({ error: 'Tournament name is required' }, { status: 400 });
        }

        const visibility = normalizeVisibility(body.visibility, 'unlisted');
        if (!visibility) {
            return NextResponse.json({ error: 'Invalid tournament visibility' }, { status: 400 });
        }

        let organizerFields;
        try {
            organizerFields = buildOrganizerFields(body, isCommunity ? null : tenantGroupId);
        } catch (error) {
            if (error?.code && /^[A-Z_]+$/.test(error.code)) {
                return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
            }
            throw error;
        }

        const payload = buildTournamentPayload({
            ...body,
            name,
            status: 'draft',
            entrant_type: body.entrant_type || 'pair',
            settings: organizerFields.settings,
            visibility,
        }, tenantGroupId);
        Object.assign(payload, organizerFields.organizer);
        if (platformAccountId) payload.created_by_platform_account_id = platformAccountId;
        payload.public_slug = generateSlug(name);

        const { data, error } = await insertWithSlugRetry(payload);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, tournament: data });
    } catch (err) {
        console.error('Tournaments v2 POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const body = await request.json();
        const id = body?.id;
        if (!id) {
            return NextResponse.json({ error: 'Tournament id is required' }, { status: 400 });
        }

        if ('visibility' in body && !normalizeVisibility(body.visibility, null)) {
            return NextResponse.json({ error: 'Invalid tournament visibility' }, { status: 400 });
        }

        let statusChange = null;
        if ('status' in body && body.status != null) {
            const nextStatus = String(body.status);
            const { data: current, error: currentErr } = await db
                .from('tournaments')
                .select('id, status')
                .eq('id', id)
                .eq('group_id', adminCheck.groupId)
                .maybeSingle();
            if (currentErr) {
                return NextResponse.json({ error: currentErr.message }, { status: 500 });
            }
            if (!current) {
                return NextResponse.json({ error: 'Không tìm thấy giải' }, { status: 404 });
            }

            if (nextStatus !== current.status) {
                if (!isStatus(nextStatus)) {
                    return NextResponse.json({
                        error: `Trạng thái "${nextStatus}" không hợp lệ.`,
                        code: 'INVALID_STATUS',
                    }, { status: 400 });
                }
                const verdict = canTransition(current.status, nextStatus);
                if (!verdict.ok) {
                    // INVALID_STATUS_TRANSITION trả 400 bằng tiếng Việt, không để CHECK của Postgres thành 500.
                    return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
                }
                const blocked = await checkTransitionGuards(verdict.guards, id, adminCheck.groupId);
                if (blocked) return blocked;
                statusChange = { from: current.status, to: nextStatus };
            }
        }

        const payload = buildTournamentPayload(body);
        delete payload.group_id;
        if (payload.name === null) {
            return NextResponse.json({ error: 'Tournament name is required' }, { status: 400 });
        }

        const { data, error } = await db
            .from('tournaments')
            .update(payload)
            .eq('id', id)
            .eq('group_id', adminCheck.groupId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let finalStandingsWritten = true;
        if (statusChange) {
            const actorName = adminCheck.actor?.groupName || adminCheck.actor?.groupCode || adminCheck.actor?.role || 'admin';
            const logged = await writeOperationLog(db, {
                groupId: adminCheck.groupId,
                tournamentId: Number(id),
                actor: actorName,
                action: 'tournament_status_changed',
                targetType: 'tournament',
                targetId: Number(id),
                before: { status: statusChange.from },
                after: { status: statusChange.to },
            });
            if (!logged.ok) console.error('Ghi nhật ký đổi trạng thái giải lỗi:', logged.error);
            if (statusChange.to === 'completed') {
                try {
                    await writeFinalStandings(Number(id), adminCheck.groupId);
                } catch (finalErr) {
                    finalStandingsWritten = false;
                    console.error('Ghim final_standings lỗi:', finalErr);
                }
            }
        }

        return NextResponse.json({ success: true, tournament: data, final_standings_written: finalStandingsWritten });
    } catch (err) {
        console.error('Tournaments v2 PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Tournament id is required' }, { status: 400 });
        }

        const { data: target, error: targetErr } = await db
            .from('tournaments')
            .select('id, status')
            .eq('id', id)
            .eq('group_id', adminCheck.groupId)
            .maybeSingle();
        if (targetErr) {
            return NextResponse.json({ error: targetErr.message }, { status: 500 });
        }
        if (!target) {
            return NextResponse.json({ error: 'Không tìm thấy giải' }, { status: 404 });
        }

        const counts = await countMatchesByStatus(id, adminCheck.groupId);
        const verdict = canDelete(target, counts.total);
        if (!verdict.ok) {
            return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 409 });
        }

        const { error } = await db
            .from('tournaments')
            .delete()
            .eq('id', id)
            .eq('group_id', adminCheck.groupId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Tournaments v2 DELETE error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
