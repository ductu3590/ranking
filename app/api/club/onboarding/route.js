import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import clubOnboarding from '@/lib/clubOnboarding';

const { buildOnboardingState, isValidOnboardingAction } = clubOnboarding;

// Route rieng, KHONG nhet vao /api/club/settings vi ba ly do:
// 1. GET settings goi QRCode.toDataURL() moi lan (anh 320px + payload lon);
//    checklist duoc fetch o nhieu trang nen khong duoc keo theo chi phi do.
// 2. GET onboarding la truy van aggregate 4 bang, ban chat khac settings (1 bang).
// 3. PATCH settings la allowlist cot cau hinh nghiep vu; tron co UI-state vao
//    lam safeGroupForClient va phan validate phinh ra.

function buildJoinUrl(request, code) {
    if (!code) return null;
    const origin = request.headers.get('origin') || new URL(request.url).origin;
    return `${origin}/join?group=${code}`;
}

// Dem theo group_id, chi lay so luong nen dung head:true cho re.
async function countRows(db, table, groupId, applyFilters) {
    let query = db.from(table).select('id', { count: 'exact', head: true }).eq('group_id', groupId);
    if (applyFilters) query = applyFilters(query);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count || 0;
}

async function loadFacts(request, groupId) {
    const db = supabaseAdmin;

    const { data: group, error: groupError } = await db
        .from('groups')
        .select('code, logo_url, fund_qr_url, sepay_webhook_secret, onboarding_seen_at, onboarding_dismissed_at')
        .eq('id', groupId)
        .single();
    if (groupError) throw new Error(groupError.message);

    // club_members.is_active nullable -> dung "khong phai false" de khong bo sot
    // cac ban ghi cu chua set co.
    const [memberCount, tournamentCount, bankCount] = await Promise.all([
        countRows(db, 'club_members', groupId, (q) => q.not('is_active', 'is', false)),
        countRows(db, 'tournaments', groupId),
        countRows(db, 'group_bank_accounts', groupId, (q) => q.eq('is_active', true)),
    ]);

    return {
        logoUrl: group.logo_url,
        fundQrUrl: group.fund_qr_url,
        memberCount,
        tournamentCount,
        hasActiveBankAccount: bankCount > 0,
        hasWebhookSecret: Boolean(group.sepay_webhook_secret),
        seenAt: group.onboarding_seen_at,
        dismissedAt: group.onboarding_dismissed_at,
        clubCode: group.code,
        joinUrl: buildJoinUrl(request, group.code),
    };
}

export async function GET(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    try {
        const facts = await loadFacts(request, adminCheck.groupId);
        return NextResponse.json({ onboarding: buildOnboardingState(facts) });
    } catch (err) {
        console.error('[onboarding] GET failed', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
    }

    const action = body?.action;
    if (!isValidOnboardingAction(action)) {
        return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
    }

    try {
        const db = supabaseAdmin;
        const nowIso = new Date().toISOString();

        if (action === 'mark_welcome_seen') {
            // Idempotent: chi ghi khi dang NULL, khong doi moc thoi gian da co.
            const { error } = await db
                .from('groups')
                .update({ onboarding_seen_at: nowIso })
                .eq('id', adminCheck.groupId)
                .is('onboarding_seen_at', null);
            if (error) throw new Error(error.message);
        } else if (action === 'dismiss') {
            const { error } = await db
                .from('groups')
                .update({ onboarding_dismissed_at: nowIso })
                .eq('id', adminCheck.groupId);
            if (error) throw new Error(error.message);
        } else if (action === 'restore') {
            const { error } = await db
                .from('groups')
                .update({ onboarding_dismissed_at: null })
                .eq('id', adminCheck.groupId);
            if (error) throw new Error(error.message);
        }

        // Tra lai nguyen khoi onboarding de client khong phai fetch lai.
        const facts = await loadFacts(request, adminCheck.groupId);
        return NextResponse.json({ onboarding: buildOnboardingState(facts) });
    } catch (err) {
        console.error('[onboarding] PATCH failed', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
