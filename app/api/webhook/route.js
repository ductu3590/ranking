import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

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

        // 2. Phân tích tên người gửi từ nội dung
        let memberName = "Unknown";

        if (content) {
            // Cách 1: Nếu có "PKB" thì lấy phần sau PKB (ưu tiên)
            const pkbPattern = /PKB\s+([a-zA-Z0-9_\s]+)/i;
            const pkbMatch = content.match(pkbPattern);

            if (pkbMatch && pkbMatch[1]) {
                // Có "PKB" → Lấy tên sau PKB và trim khoảng trắng
                memberName = pkbMatch[1].trim().toUpperCase();
            } else {
                // Cách 2: Không có "PKB" → Phân tích content
                // Pattern phổ biến: "<TÊN> chuyen tien" hoặc "<TÊN> nop tien"

                // Loại bỏ các từ khóa phổ biến
                let cleanContent = content
                    .replace(/chuyen\s*tien/gi, '')
                    .replace(/nop\s*tien/gi, '')
                    .replace(/gui\s*tien/gi, '')
                    .replace(/thanh\s*toan/gi, '')
                    .replace(/BankAPINotify/gi, '')
                    .trim();

                // Lấy phần đầu tiên (thường là tên người gửi)
                const words = cleanContent.split(/\s+/);
                if (words.length > 0 && words[0].length > 0) {
                    // Ghép 2-3 từ đầu tiên làm tên (VD: "DO DUC TU" → "DO DUC TU")
                    memberName = words.slice(0, Math.min(3, words.length)).join(' ').toUpperCase();
                }
            }
        }

        // Fallback: Nếu vẫn là "Unknown" thì dùng accountName
        if (memberName === "Unknown" && accountName) {
            memberName = accountName.substring(0, 50).toUpperCase(); // Giới hạn 50 ký tự
        }

        console.log('Extracted member name:', memberName);

        // 3. Lưu vào Supabase
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

    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ message: 'Invalid Request', error: error.message }, { status: 400 });
    }
}
