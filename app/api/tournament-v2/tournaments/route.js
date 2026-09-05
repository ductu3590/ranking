import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';
import { requirePlatformAdmin } from '@/lib/platformSession';
import { assertTournamentOrganizer } from '@/lib/tournament/interclub';
import { resolveOrganizerPayload } from '@/lib/tournament/wizardModel';

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

        return NextResponse.json({ tournaments: data || [] });
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
            status: body.status || 'draft',
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

        return NextResponse.json({ success: true, tournament: data });
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
