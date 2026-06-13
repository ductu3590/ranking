import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { parseTransaction } from '@/lib/transaction-parser';
import { DEFAULT_GROUP_ID } from '@/lib/groupConstants';

export async function POST(req) {
    try {
        const data = await req.json();

        // ═══ LOG TOÀN BỘ PAYLOAD ĐỂ DEBUG ═══
        // Xem log này trên Vercel để biết SePay gửi field nào
        console.log('=== SEPAY WEBHOOK RAW PAYLOAD ===');
        console.log(JSON.stringify(data, null, 2));
        console.log('=== ALL KEYS:', Object.keys(data));
        console.log('================================');

        // Field names theo tài liệu chính thức SePay:
        // id, gateway, transactionDate, accountNumber, subAccount,
        // code, content, transferType, description, transferAmount,
        // accumulated, referenceCode
        const amount = data.transferAmount || 0; // Luôn số dương theo docs SePay
        const content = data.content || data.transferContent || ''; // SePay dùng "content"
        const reference = data.referenceCode || data.code || String(data.id || '');
        const accountName = data.description || data.accountName || ''; // SePay dùng "description"

        // ═══ XÁC ĐỊNH HƯỚNG GIAO DỊCH ═══
        // Theo tài liệu chính thức SePay: field `transferType` = "in" hoặc "out"
        // transferAmount luôn là số dương, không phân biệt hướng bằng dấu.
        const huongGiaoDich = (data.transferType === 'out') ? 'out' : 'in';
        console.log(`transferType: "${data.transferType}" → hướng: ${huongGiaoDich}`);

        console.log('Final direction:', huongGiaoDich, '| Amount:', amount, '| Content:', content);

        // 2. Resolve which club this transfer belongs to, by the receiving bank account.
        const accountNumber = String(data.accountNumber || data.subAccount || '').trim();
        let groupId = DEFAULT_GROUP_ID;
        if (accountNumber) {
            const { data: bankAccount } = await supabaseServer
                .from('group_bank_accounts')
                .select('group_id')
                .eq('account_number', accountNumber)
                .eq('is_active', true)
                .maybeSingle();
            if (bankAccount) {
                groupId = bankAccount.group_id;
            } else {
                console.warn(`No club registered for accountNumber "${accountNumber}" — falling back to default group.`);
            }
        }

        // Parse transaction
        const parseResult = await parseTransaction(content, amount, accountName, huongGiaoDich, groupId);

        console.log('Parse result:', parseResult);

        // 3. Lưu vào Supabase
        const { data: insertedData, error } = await supabaseServer
            .from('quy_pickleball')
            .insert({
                group_id: groupId,
                nguoi_nop: parseResult.memberName,
                so_tien: amount,
                noi_dung_goc: content,
                ma_giao_dich: reference,
                confidence_score: parseResult.confidence,
                bank_detected: parseResult.bankDetected,
                parsing_method: parseResult.parsingMethod,
                loai_giao_dich: parseResult.loaiGiaoDich,
                huong_giao_dich: huongGiaoDich, // Dùng giá trị đã xác định ở trên
                is_manually_categorized: false
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
            category: parseResult.loaiGiaoDich
        }, { status: 200 });

    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ message: 'Invalid Request', error: error.message }, { status: 400 });
    }
}
