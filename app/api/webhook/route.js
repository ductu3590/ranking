import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { parseTransaction } from '@/lib/transaction-parser';

export async function POST(req) {
    try {
        const rawBody = await req.text();
        const data = JSON.parse(rawBody);
        const groupRouting = await resolveGroupFromBankAccount(data);
        if (!groupRouting) {
            return NextResponse.json({ message: 'Unknown bank account' }, { status: 422 });
        }

        const authError = verifySePaySignature(req, rawBody, groupRouting.sepayWebhookSecret);
        if (authError) return authError;

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
            });

        if (error) {
            if (error.code === '23505') {
                console.log('Transaction already exists:', reference);
                return NextResponse.json({ message: 'Transaction exists' }, { status: 200 });
            }
            console.error('Supabase Error:', JSON.stringify(error, null, 2));
            return NextResponse.json({ message: 'Error saving', error: error.message }, { status: 500 });
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

function verifySePaySignature(req, rawBody, sepayWebhookSecret) {
    if (!sepayWebhookSecret) {
        return null;
    }

    const signature = req.headers.get('X-SePay-Signature') || '';
    const timestamp = req.headers.get('X-SePay-Timestamp') || '';
    if (!signature || !timestamp) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const timestampSeconds = Number(timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
        return NextResponse.json({ message: 'Request expired' }, { status: 401 });
    }

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', sepayWebhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

    const received = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
        return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
    }

    return null;
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
