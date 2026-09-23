import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import sepayVerify from '@/lib/sepayVerify';
import fundQr from '@/lib/fundQr';

const { maskAccountNumber } = sepayVerify;
const { QR_PROVIDERS, findBank, buildQrImageUrl } = fundQr;

const MAX_IMAGE_BYTES = 200 * 1024; // 200KB — tran cua migration 044 / app/api/club/settings/route.js

// SUA VONG 2 (2026-09-22, sau nghiem thu Tester + quyet dinh anh Tu):
// Do that tu curl: vietqr.app/img phan hoi ~0.2s; qr.sepay.vn/img IM LANG hoan
// toan (khong nhan byte nao) sau 45s, ca 3 lan do doc lap. Route nay chay tren
// Vercel serverless — cung mot kieu chan IP datacenter co the xay ra tren
// production, va Vercel Hobby cat cung serverless function o 10s. Voi cau
// hinh cu (8s/lan thu x 2 template) neu SePay im lang that, route chet ~16s
// truoc khi kip roi xuong vietqr -> 504 du vietqr chay tot.
//
// Cach sua: giu SePay la provider UU TIEN (anh Tu chot), nhung:
//   1. SePay (provider dau) chi duoc mot ngan sach NGAN — 2.5s. Da do thuc te no
//      hoac im lang hoan toan hoac khong phan hoi, nen cho lau hon chi la cho vo ich.
//   2. Provider du phong (vietqr) duoc ngan sach rong hon — 4s — vi no la noi
//      chung ta CAN thanh cong, va thuc te no rat nhanh (~0.2s) nen 4s van con
//      nhieu margin cho hom mang xau.
//   3. Mot TRAN TONG (IMAGE_FETCH_BUDGET_MS = 7000ms) ap cho CA vong lap —
//      moi lan thu deu kiem ngan sach con lai truoc khi chay, het ngan sach la
//      dung ngay, khong co ky nao vuot qua no du logic template co lap lai bao
//      nhieu lan. 7s cho mang + ~1.5-2s cho cac truy van DB truoc/sau (loadAccount,
//      update account, update group) = ~8.5-9s tong, con margin ~1-1.5s truoc
//      khi Vercel Hobby cat o 10s. (SUA VONG 4: bo them loadGroupName — vong 4
//      xoa han buildShareMessage nen khong con can ten CLB o route nay nua,
//      ngan sach DB con it hon nua so voi uoc tinh ban dau.)
const PRIMARY_PROVIDER_TIMEOUT_MS = 2500; // SePay (uu tien) — that bai la im lang, khong phai cham
const FALLBACK_PROVIDER_TIMEOUT_MS = 4000; // vietqr (du phong) — thuc te ~0.2s, 4s van rong
const IMAGE_FETCH_BUDGET_MS = 7000; // tran TONG cho ca vong lap tai anh (khong tinh DB truoc/sau)
const MIN_ATTEMPT_BUDGET_MS = 500; // duoi muc nay thi khong dang thu them, giu margin an toan

function noStore(payload, status = 200) {
    return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function loadAccount(groupId, accountId) {
    const { data, error } = await supabaseAdmin
        .from('group_bank_accounts')
        .select('id, group_id, account_number, bank_name, bank_code, bank_bin, account_holder, is_active, created_at')
        .eq('group_id', groupId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    const accounts = data || [];
    if (accounts.length === 0) return null;

    if (accountId) {
        return accounts.find((a) => String(a.id) === String(accountId)) || null;
    }
    return accounts[0];
}

// Tai anh tu mot provider voi timeout rieng cho lan goi nay. Tra ve
// { ok:true, buffer, contentType } hoac { ok:false }.
async function fetchQrImage(url, timeoutMs) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.startsWith('image/')) {
            return { ok: false };
        }
        const arrayBuffer = await res.arrayBuffer();
        return { ok: true, buffer: Buffer.from(arrayBuffer), contentType };
    } catch {
        return { ok: false };
    }
}

// Thu lan luot theo QR_PROVIDERS (SePay truoc, VietQR sau — giu nguyen thu tu
// uu tien SePay theo yeu cau anh Tu). Voi MOI provider: thu template 'compact'
// truoc.
//   - Neu KHONG phan hoi (timeout/loi mang) -> BO QUA template 'qronly' cua
//     chinh provider nay, sang thang provider ke tiep. Timeout la dau hieu
//     endpoint khong toi duoc; thu them template khac cung provider chi ton
//     them thoi gian vo ich (day chinh la nguyen nhan gay ~16s chet o vong 1).
//   - Neu CO phan hoi nhung anh vuot 200KB -> moi thu lai voi template
//     'qronly' cung provider (anh nho hon).
// Moi lan thu deu kiem tra ngan sach thoi gian CON LAI truoc khi chay — het
// ngan sach (IMAGE_FETCH_BUDGET_MS) la dung han, khong co duong nao vuot qua
// tran nay du bao nhieu provider/template con lai.
async function generateQrImage({ bankCode, accountNumber, accountHolder }) {
    const startedAt = Date.now();

    for (const provider of QR_PROVIDERS) {
        const baseTimeout = provider === QR_PROVIDERS[0] ? PRIMARY_PROVIDER_TIMEOUT_MS : FALLBACK_PROVIDER_TIMEOUT_MS;

        for (const template of ['compact', 'qronly']) {
            const remaining = IMAGE_FETCH_BUDGET_MS - (Date.now() - startedAt);
            if (remaining < MIN_ATTEMPT_BUDGET_MS) {
                console.warn(`[fund-qr-generate] het ngan sach thoi gian (${IMAGE_FETCH_BUDGET_MS}ms), dung thu tiep`);
                return null;
            }

            const timeout = Math.min(baseTimeout, remaining);
            const url = buildQrImageUrl({ provider, bankCode, accountNumber, accountHolder, template });
            const result = await fetchQrImage(url, timeout);

            if (result.ok && result.buffer.length <= MAX_IMAGE_BYTES) {
                return { ...result, provider, url };
            }
            if (result.ok) {
                console.warn(`[fund-qr-generate] anh tu ${provider} (${template}) qua ${result.buffer.length} byte, thu tiep`);
                continue; // thu template con lai (qronly) cung provider nay
            }
            console.warn(`[fund-qr-generate] provider ${provider} (${template}) khong phan hoi trong ${timeout}ms — bo qua template con lai, sang provider ke tiep`);
            break; // KHONG thu qronly khi da timeout/loi — sang provider ke tiep
        }
    }
    return null;
}

// POST — admin CLB tao/lam moi anh QR nhan quy tu tai khoan da khai voi SePay.
export async function POST(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    const bankCode = String(body?.bankCode || '').trim();
    const accountHolder = String(body?.accountHolder || '').trim();
    const accountId = body?.accountId ?? null;

    const bank = findBank(bankCode);
    if (!bank) {
        return noStore({ error: 'Ngân hàng không hợp lệ.' }, 400);
    }

    try {
        const account = await loadAccount(adminCheck.groupId, accountId);
        if (!account) {
            return noStore({ error: 'Chưa khai báo số tài khoản quỹ. Hãy kết nối Auto Quỹ với SePay trước.' }, 400);
        }

        // SUA VONG 3 #8: chi ghi de account_holder khi admin THAT SU nhap gia
        // tri moi — ban cu ghi `accountHolder || null` vo dieu kien, neu goi lai
        // API ma de trong o se XOA TRANG ten chu tai khoan da luu tu truoc.
        const nextAccountHolder = accountHolder || account.account_holder || null;

        // Nho lua chon ngan hang cho lan sau, scope dung group_id.
        const { error: updateAccountError } = await supabaseAdmin
            .from('group_bank_accounts')
            .update({ bank_code: bank.code, bank_bin: bank.bin, bank_name: bank.name, account_holder: nextAccountHolder })
            .eq('id', account.id)
            .eq('group_id', adminCheck.groupId);
        if (updateAccountError) throw new Error(updateAccountError.message);

        const image = await generateQrImage({
            bankCode: bank.code,
            accountNumber: account.account_number,
            accountHolder: nextAccountHolder,
        });
        if (!image) {
            return noStore({ error: 'Không tải được ảnh QR lúc này, thử lại sau ít phút.' }, 502);
        }

        const dataUrl = `data:${image.contentType};base64,${image.buffer.toString('base64')}`;

        const { error: updateGroupError } = await supabaseAdmin
            .from('groups')
            .update({ fund_qr_url: dataUrl })
            .eq('id', adminCheck.groupId);
        if (updateGroupError) throw new Error(updateGroupError.message);

        return noStore({
            fundQrUrl: dataUrl,
            // SUA VONG 3 #6: truoc day tra dataUrl lan thu hai (~273.000 ky tu),
            // lam response phinh gap doi (~546KB) vo ich. imageUrl gio la URL
            // that cua provider da dung — nhe va co the doi chieu duoc.
            imageUrl: image.url,
            provider: image.provider,
            // SUA VONG 4: bo truong shareMessage — khong con UI nao doc no sau
            // khi bo nut "Sao chep loi nhan" (xem FundQrShare.js).
            account: {
                id: account.id,
                accountNumberMasked: maskAccountNumber(account.account_number),
                bankCode: bank.code,
                bankName: bank.name,
                accountHolder: nextAccountHolder,
            },
        });
    } catch (err) {
        console.error('[fund-qr-generate] POST failed', err);
        // SUA VONG 3 #7: khong ro ri thong diep loi noi bo (Supabase/Postgres,
        // tieng Anh) ra client — tra cau tieng Viet co dinh, giu console.error
        // day du de debug tren server.
        return noStore({ error: 'Không tạo được mã QR, thử lại sau ít phút.' }, 500);
    }
}
