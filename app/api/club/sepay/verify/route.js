import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import sepayVerify from '@/lib/sepayVerify';

const { verifyWindowEnd, buildVerifyView, maskAccountNumber, maskSecret } = sepayVerify;

const GROUP_FIELDS = 'id, sepay_webhook_secret, sepay_verify_until, sepay_last_signal_at, sepay_verify_hint';

// Khoa bao mat plaintext chi duoc tra ve o dung hai cho: khoanh khac vua sinh ra
// (POST) va khi cua so kiem tra con mo (GET). Ngoai ra chi tra ban che.
function noStore(payload, status = 200) {
    return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function webhookUrl(request) {
    const origin = request.headers.get('origin') || new URL(request.url).origin;
    return `${origin}/api/webhook`;
}

async function loadGroup(groupId) {
    const { data, error } = await supabaseAdmin.from('groups').select(GROUP_FIELDS).eq('id', groupId).single();
    if (error) throw new Error(error.message);
    return data;
}

async function loadBankAccounts(groupId) {
    const { data, error } = await supabaseAdmin
        .from('group_bank_accounts')
        .select('id, account_number, bank_name, is_active')
        .eq('group_id', groupId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((account) => ({
        id: account.id,
        accountNumberMasked: maskAccountNumber(account.account_number),
        bankName: account.bank_name,
    }));
}

// So giao dich SePay thang nay + moc giao dich gan nhat, cho the "han muc goi
// mien phi" va the "suc khoe ket noi". Tinh tu quy_pickleball da co, khong can
// bang moi.
async function loadConnectionStats(groupId) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [{ count, error: countError }, { data: latest, error: latestError }] = await Promise.all([
        supabaseAdmin
            .from('quy_pickleball')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .gte('created_at', monthStart.toISOString()),
        supabaseAdmin
            .from('quy_pickleball')
            .select('created_at')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    if (countError) throw new Error(countError.message);
    if (latestError) throw new Error(latestError.message);

    return {
        monthlyCount: count || 0,
        lastTransactionAt: latest?.created_at || null,
    };
}

async function buildPayload(request, groupId, { includeSecret = false } = {}) {
    const group = await loadGroup(groupId);
    const [bankAccounts, stats] = await Promise.all([
        loadBankAccounts(groupId),
        loadConnectionStats(groupId),
    ]);
    const view = buildVerifyView(group);
    const secret = group.sepay_webhook_secret;
    const showSecret = includeSecret || view.status === 'waiting';

    return {
        verify: view,
        webhook: {
            url: webhookUrl(request),
            algorithm: 'HMAC-SHA256',
            secret: showSecret ? secret : null,
            secretMasked: maskSecret(secret),
        },
        bankAccounts,
        connection: {
            hasSecret: Boolean(secret),
            activeAccountCount: bankAccounts.length,
            ...stats,
        },
    };
}

// POST — sinh khoa bao mat, va tuy chon mo cua so kiem tra ket noi.
//
// startVerify=false: chi sinh khoa, KHONG mo cua so. Dung o buoc khai bao —
// admin con phai sang SePay lien ket ngan hang roi tao webhook, mo cua so tu
// luc do thi 10 phut het truoc khi ho lam xong.
// startVerify=true (mac dinh): mo cua so 10 phut, dung khi admin da san sang
// bam "Gui thu".
//
// KHONG tu xoay khoa da co: xoay nghia la webhook dang cau hinh ben SePay se ky
// sai -> quy ngung cap nhat im lang.
export async function POST(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    try {
        const group = await loadGroup(adminCheck.groupId);
        const startVerify = body?.startVerify !== false;
        const updates = { sepay_verify_hint: null };
        if (startVerify) updates.sepay_verify_until = verifyWindowEnd().toISOString();

        let secretIsNew = false;
        if (!group.sepay_webhook_secret || body?.rotateSecret === true) {
            updates.sepay_webhook_secret = crypto.randomBytes(32).toString('hex');
            secretIsNew = true;
        }

        const { error } = await supabaseAdmin.from('groups').update(updates).eq('id', adminCheck.groupId);
        if (error) throw new Error(error.message);

        const payload = await buildPayload(request, adminCheck.groupId, { includeSecret: true });
        payload.webhook.secretIsNew = secretIsNew;
        return noStore(payload);
    } catch (err) {
        console.error('[sepay-verify] POST failed', err);
        return noStore({ error: err.message }, 500);
    }
}

// GET — client poll trang thai.
export async function GET(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    try {
        return noStore(await buildPayload(request, adminCheck.groupId));
    } catch (err) {
        console.error('[sepay-verify] GET failed', err);
        return noStore({ error: err.message }, 500);
    }
}

// DELETE — dong cua so kiem tra. Khong dung toi ket noi dang chay.
export async function DELETE(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    try {
        const { error } = await supabaseAdmin
            .from('groups')
            .update({ sepay_verify_until: null, sepay_verify_hint: null })
            .eq('id', adminCheck.groupId);
        if (error) throw new Error(error.message);

        return noStore(await buildPayload(request, adminCheck.groupId));
    } catch (err) {
        console.error('[sepay-verify] DELETE failed', err);
        return noStore({ error: err.message }, 500);
    }
}
