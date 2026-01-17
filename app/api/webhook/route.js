import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { parseTransaction } from '@/lib/transaction-parser';

export async function POST(req) {
    try {
        const data = await req.json();

        // Log để debug
        console.log('Webhook received:', JSON.stringify(data, null, 2));

        // 1. Lấy thông tin từ SePay
        const amount = data.transferAmount;
        const content = data.transferContent || data.content || '';
        const reference = data.referenceCode;
        const accountName = data.accountName || '';

        console.log('Parsed data:', { amount, content, reference, accountName });

        // 2. Parse transaction sử dụng module mới
        const parseResult = await parseTransaction(content, amount, accountName);

        console.log('Parse result:', parseResult);

        // 3. Lưu vào Supabase với thông tin đầy đủ
        console.log('Attempting to insert:', {
            nguoi_nop: parseResult.memberName,
            so_tien: amount,
            noi_dung_goc: content,
            ma_giao_dich: reference,
            confidence_score: parseResult.confidence,
            bank_detected: parseResult.bankDetected,
            parsing_method: parseResult.parsingMethod,
            loai_giao_dich: parseResult.loaiGiaoDich,
            huong_giao_dich: parseResult.huongGiaoDich
        });

        const { data: insertedData, error } = await supabaseServer
            .from('quy_pickleball')
            .insert({
                nguoi_nop: parseResult.memberName,
                so_tien: amount,
                noi_dung_goc: content,
                ma_giao_dich: reference,
                confidence_score: parseResult.confidence,
                bank_detected: parseResult.bankDetected,
                parsing_method: parseResult.parsingMethod,
                loai_giao_dich: parseResult.loaiGiaoDich,
                huong_giao_dich: parseResult.huongGiaoDich,
                is_manually_categorized: false
            });

        if (error) {
            // Nếu lỗi do trùng mã giao dịch (Unique key) thì bỏ qua
            if (error.code === '23505') {
                console.log('Transaction already exists:', reference);
                return NextResponse.json({ message: 'Transaction exists' }, { status: 200 });
            }
            console.error("Supabase Error:", JSON.stringify(error, null, 2));
            return NextResponse.json({ message: 'Error saving', error: error.message }, { status: 500 });
        }

        console.log('Successfully inserted:', insertedData);
        return NextResponse.json({
            message: 'Success',
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

