import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { generateSlug } from '@/lib/tournament/publicSlug';
import { requireCommunityAdmin, listAdminCommunityTournaments } from '@/lib/communityAdminServer';
import { communityError, communityJson } from '@/lib/communityServer';

export const dynamic = 'force-dynamic';

// GET: danh sách giải cộng đồng (PLA-03). Chỉ admin hệ thống (platform_session).
export async function GET() {
    try {
        const admin = await requireCommunityAdmin();
        if (!admin.ok) return admin.response;
        return communityJson({ tournaments: await listAdminCommunityTournaments(), role: admin.role });
    } catch (error) {
        console.error('community admin tournaments GET error:', error);
        return communityError('INTERNAL', 500);
    }
}

const TEXT_FIELDS = { name: 'name', location: 'location', description: 'description' };

// PATCH {id, name?, location?, description?, eventDate?, openRegistration?}: sửa giải cộng đồng. Đóng/mở đăng ký ghi vào
// settings.open_registration (RPC đọc khoá này). Quyền: requireTournamentAccess (community_admin chỉ giải cộng đồng).
// Tạo giải và nội dung dùng các route sẵn có (POST /tournaments organizer_mode='community', /divisions) vốn đã nhận platform actor.
export async function PATCH(request) {
    try {
        const admin = await requireCommunityAdmin();
        if (!admin.ok) return admin.response;
        const body = await request.json().catch(() => ({}));
        const id = Number(body?.id);
        if (!Number.isSafeInteger(id) || id <= 0) return communityError('COMMUNITY_NOT_FOUND', 404);
        const access = await requireTournamentAccess({ tournamentId: id, need: 'write' });
        if (!access.ok) return access.response;

        const { data: current, error: readError } = await supabaseAdmin.from('tournaments')
            .select('id, name, public_slug, settings, organizer_type').eq('id', id).eq('group_id', access.groupId).maybeSingle();
        if (readError) throw readError;
        if (!current || current.organizer_type !== 'community') return communityError('COMMUNITY_NOT_FOUND', 404);

        const update = { updated_at: new Date().toISOString() };
        for (const [key, column] of Object.entries(TEXT_FIELDS)) {
            if (!(key in body)) continue;
            const value = String(body[key] ?? '').trim();
            if (key === 'name' && !value) return communityJson({ error: 'Tên giải không được để trống.', code: 'COMMUNITY_NAME_REQUIRED' }, 400);
            update[column] = value || null;
        }
        if ('eventDate' in body) {
            const value = body.eventDate ? String(body.eventDate) : null;
            if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return communityJson({ error: 'Ngày thi đấu không hợp lệ.', code: 'COMMUNITY_DATE_INVALID' }, 400);
            update.event_date = value;
        }
        if ('openRegistration' in body) {
            update.settings = { ...(current.settings || {}), open_registration: body.openRegistration === true };
            // Mở đăng ký cần link công khai: bảo đảm slug và visibility unlisted (giải đã có slug thì giữ nguyên).
            if (body.openRegistration === true) {
                update.visibility = 'unlisted';
                if (!current.public_slug) update.public_slug = generateSlug(update.name || current.name);
            }
        }

        const { data, error } = await supabaseAdmin.from('tournaments').update(update).eq('id', id).eq('group_id', access.groupId)
            .select('id, name, public_slug, settings, status').single();
        if (error) throw error;
        return communityJson({ id: data.id, name: data.name, slug: data.public_slug, openRegistration: data.settings?.open_registration === true, status: data.status });
    } catch (error) {
        console.error('community admin tournaments PATCH error:', error);
        return communityError('INTERNAL', 500);
    }
}
