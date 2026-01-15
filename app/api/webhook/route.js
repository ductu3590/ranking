import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req) {
    try {
        const data = await req.json();

        // Log để debug
        console.log('Webhook received:', JSON.stringify(data, null, 2));

        // 1. Lấy thông tin từ SePay
        const amount = data.transferAmount;
        const content = data.transferContent; // VD: "PKB TUAN NOP PHAT"
        const reference = data.referenceCode;

        // 2. Kiểm tra cú pháp "PKB"
        if (content && content.toUpperCase().includes('PKB')) {

            // 3. Regex tách tên (Lấy chữ ngay sau PKB)
            const pattern = /PKB\s+([a-zA-Z0-9_]+)/i;
            const match = content.match(pattern);

            let memberName = "Unknown";
            if (match && match[1]) {
                memberName = match[1].toUpperCase();
            }

            // 4. Lưu vào Supabase
            console.log('Attempting to insert:', { memberName, amount, content, reference });

            const { data: insertedData, error } = await supabaseServer
                .from('quy_pickleball')
                .insert({
                    nguoi_nop: memberName,
                    so_tien: amount,
                    noi_dung_goc: content,
                    ma_giao_dich: reference
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
            return NextResponse.json({ message: 'Success', user: memberName }, { status: 200 });
        }

        return NextResponse.json({ message: 'Ignored (Not PKB)' }, { status: 200 });

    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ message: 'Invalid Request', error: error.message }, { status: 400 });
    }
}
