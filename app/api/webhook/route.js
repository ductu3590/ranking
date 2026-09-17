import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { parseTransaction } from '@/lib/transaction-parser';
import sepayWebhookAuth from '@/lib/sepayWebhookAuth';
import sepayVerify from '@/lib/sepayVerify';

const { checkWebhookAuth } = sepayWebhookAuth;
const { matchVerifyingGroup } = sepayVerify;

export async function POST(req) {
    try {
        const rawBody = await req.text();
        const data = JSON.parse(rawBody);
        const groupRouting = await resolveGroupFromBankAccount(data);
        if (!groupRouting) {
            // Khong khop tai khoan nao. Truoc khi tra 422 nhu cu, thu xem co phai
            // tin hieu "Gui thu" cua mot CLB dang kiem tra ket noi khong — payload
            // "Gui thu" la payload MAU nen khong bao gio khop tai khoan that.
            const verified = await tryMatchVerifySignal(req, rawBody);
            if (verified) return verified;
            return NextResponse.json({ message: 'Unknown bank account' }, { status: 422 });
        }

        const authError = verifySePaySignature(req, rawBody, groupRouting.sepayWebhookSecret);
        if (authError) return authError;

        // Giao dich that cung la bang chung duong ong dang chay: cap nhat moc de
        // the "suc khoe ket noi" khong bao dong nham. Best-effort, khong duoc
        // lam hong viec ghi so quy.
        touchSepaySignal(groupRouting.groupId);

        console.log('=== SEPAY WEBHOOK RAW PAYLOAD ===');
        console.log(JSON.stringify(data, null, 2));
        console.log('=== ALL KEYS:', Object.keys(data));
        console.log('================================');

        const amount = data.transferAmount || 0;
        const content = data.content || data.transferContent || '';
        const reference = String(data.referenceCode || data.code || data.id || '').trim();
        if (!reference.trim()) {
            return NextResponse.json({ message: 'Missing transaction reference' }, { status: 422 });
        }
        const accountName = data.description || data.accountName || '';
        const huongGiaoDich = data.transferType === 'out' ? 'out' : 'in';

        console.log(`transferType: "${data.transferType}" -> huong: ${huongGiaoDich}`);
        console.log('Final direction:', huongGiaoDich, '| Amount:', amount, '| Content:', content);

        const parseResult = await parseTransaction(content, amount, accountName, huongGiaoDich, groupRouting.groupId);
        console.log('Parse result:', parseResult);

        const { data: insertedData, error } = await supabaseServer
            .from('quy_pickleball')
            .insert({
                group_id: groupRouting.groupId,
                nguoi_nop: parseResult.memberName,
                so_tien: amount,
                noi_dung_goc: content,
                ma_giao_dich: reference,
                confidence_score: parseResult.confidence,
                bank_detected: parseResult.bankDetected,
                parsing_method: parseResult.parsingMethod,
                loai_giao_dich: parseResult.loaiGiaoDich,
                huong_giao_dich: huongGiaoDich,
                is_manually_categorized: false,
            })
                .select('id, nguoi_nop, so_tien, noi_dung_goc, ma_giao_dich, created_at')
                .single();

        if (error) {
            if (error.code === '23505') {
                console.log('Transaction already exists:', reference);
                return NextResponse.json({ message: 'Transaction exists' }, { status: 200 });
            }
            console.error('Supabase Error:', JSON.stringify(error, null, 2));
            return NextResponse.json({ message: 'Error saving', error: error.message }, { status: 500 });
        }

        try {
            if (huongGiaoDich === 'in' && amount > 0 && parseResult.memberName === 'Unknown') {
                await supabaseServer.from('club_notifications').upsert({
                    group_id: groupRouting.groupId,
                    kind: 'unassigned_transaction',
                    subject_type: 'quy_pickleball',
                    subject_id: insertedData.id,
                    payload: {
                        so_tien: insertedData.so_tien,
                        noi_dung_goc: insertedData.noi_dung_goc,
                        ma_giao_dich: insertedData.ma_giao_dich,
                        created_at: insertedData.created_at,
                    },
                }, { onConflict: 'group_id,kind,subject_type,subject_id', ignoreDuplicates: true });
            }
        } catch (notifyError) {
            console.error('Không tạo được thông báo giao dịch chưa gán:', notifyError);
        }

        console.log('Successfully inserted:', insertedData);
        return NextResponse.json({
            message: 'Success',
            direction: huongGiaoDich,
            user: parseResult.memberName,
            confidence: parseResult.confidence,
            method: parseResult.parsingMethod,
            category: parseResult.loaiGiaoDich,
        }, { status: 200 });
    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ message: 'Invalid Request', error: error.message }, { status: 400 });
    }
}

// Thuat toan nam trong lib/sepayWebhookAuth.js — nguon duy nhat, dung chung voi
// nhanh kiem tra ket noi. Hanh vi giu nguyen 100%: secret NULL thi bo qua xac
// thuc (tuong thich nguoc voi cac CLB chua bat khoa bao mat).
function verifySePaySignature(req, rawBody, sepayWebhookSecret) {
    const failure = checkWebhookAuth(req.headers, rawBody, sepayWebhookSecret);
    if (!failure) return null;
    return NextResponse.json({ message: failure.message }, { status: failure.status });
}

// Ghi moc "lan cuoi nhan tin hieu tu SePay". Best-effort: loi o day khong duoc
// anh huong viec ghi so quy.
function touchSepaySignal(groupId) {
    supabaseServer
        .from('groups')
        .update({ sepay_last_signal_at: new Date().toISOString(), sepay_verify_hint: null })
        .eq('id', groupId)
        .then(({ error }) => {
            if (error) console.error('Khong cap nhat duoc sepay_last_signal_at:', error.message);
        }, (err) => console.error('Khong cap nhat duoc sepay_last_signal_at:', err));
}

// Nhanh KIEM TRA KET NOI. Chay khi payload khong khop tai khoan nao.
// Chu ky HMAC la bang chung duy nhat: KHONG suy ra gi tu payload, nen khong co
// rui ro gan nham tai khoan cho CLB khac.
async function tryMatchVerifySignal(req, rawBody) {
    const nowIso = new Date().toISOString();

    const { data: candidates, error } = await supabaseServer
        .from('groups')
        .select('id, sepay_webhook_secret')
        .gt('sepay_verify_until', nowIso)
        .not('sepay_webhook_secret', 'is', null)
        .limit(sepayVerify.MAX_VERIFYING_GROUPS + 1);

    if (error) {
        console.error('Khong tra duoc danh sach CLB dang kiem tra ket noi:', error.message);
        return null;
    }

    const { matched, candidates: checked } = matchVerifyingGroup(candidates, req.headers, rawBody);

    if (matched) {
        // KHONG log khoa bao mat — chi log id CLB.
        console.log(`[sepay-verify] CLB ${matched.id} da nhan tin hieu Gui thu hop le.`);
        const { error: updateError } = await supabaseServer
            .from('groups')
            .update({ sepay_last_signal_at: new Date().toISOString(), sepay_verify_hint: null })
            .eq('id', matched.id);
        if (updateError) console.error('Khong ghi duoc moc tin hieu:', updateError.message);
        return NextResponse.json({ message: 'Verify signal accepted' }, { status: 200 });
    }

    if (checked.length === 0) return null; // khong ai dang cho -> 422 nhu cu

    // Co CLB dang cho nhung khong chu ky nao khop. Chi ghi goi y khi dung MOT
    // CLB dang cho; nhieu CLB thi khong biet gan cho ai.
    // Chu ky sai KHONG dong cua so — ke la gui rac khong pha duoc phien cua admin.
    if (checked.length === 1) {
        const { error: hintError } = await supabaseServer
            .from('groups')
            .update({ sepay_verify_hint: 'signature_mismatch' })
            .eq('id', checked[0].id);
        if (hintError) console.error('Khong ghi duoc goi y chan doan:', hintError.message);
    }
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
}

async function resolveGroupFromBankAccount(data) {
    const accountNumber = String(data.accountNumber || data.subAccount || '').trim();
    if (!accountNumber) {
        console.warn('SePay webhook missing accountNumber/subAccount; rejecting to avoid misrouting.');
        return null;
    }

    const { data: bankAccount, error: bankError } = await supabaseServer
        .from('group_bank_accounts')
        .select('group_id')
        .eq('account_number', accountNumber)
        .eq('is_active', true)
        .maybeSingle();

    if (bankError) {
        throw new Error(`Error resolving bank account: ${bankError.message}`);
    }
    if (!bankAccount) {
        console.warn(`No club registered for accountNumber "${accountNumber}"; rejecting to avoid misrouting.`);
        return null;
    }

    const { data: group, error: groupError } = await supabaseServer
        .from('groups')
        .select('sepay_webhook_secret')
        .eq('id', bankAccount.group_id)
        .single();

    if (groupError) {
        throw new Error(`Error loading group webhook secret: ${groupError.message}`);
    }

    return {
        groupId: bankAccount.group_id,
        sepayWebhookSecret: group?.sepay_webhook_secret || null,
    };
}
