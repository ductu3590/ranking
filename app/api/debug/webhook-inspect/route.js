/**
 * DEBUG: Webhook Inspector
 * POST /api/debug/webhook-inspect
 * 
 * Gửi payload giả lập từ SePay để xem hệ thống parse ra sao
 * Chỉ dùng trong development/debug, không lưu vào database
 */

import { NextResponse } from 'next/server';
import { parseTransaction } from '@/lib/transaction-parser';
import { debugGuard } from '@/lib/debugGuard';

// Debug-only route: never prerender or run in production.
export const dynamic = 'force-dynamic';

export async function POST(req) {
    const blocked = debugGuard();
    if (blocked) return blocked;
    try {
        const data = await req.json();

        // Mirror logic từ webhook chính
        const amount = Math.abs(data.transferAmount || 0);
        const content = data.transferContent || data.content || '';
        const reference = data.referenceCode || data.code || '';
        const accountName = data.accountName || data.account_name || '';

        // Xác định hướng
        let huongGiaoDich = 'in';
        let directionSource = 'default';

        if (data.transferType) {
            const t = data.transferType.toLowerCase();
            huongGiaoDich = (t === 'out' || t === 'debit' || t === 'dr') ? 'out' : 'in';
            directionSource = `transferType: "${data.transferType}"`;
        } else if (data.type) {
            const t = data.type.toLowerCase();
            huongGiaoDich = (t === 'out' || t === 'debit' || t === 'dr') ? 'out' : 'in';
            directionSource = `type: "${data.type}"`;
        } else if (typeof data.transferAmount === 'number' && data.transferAmount < 0) {
            huongGiaoDich = 'out';
            directionSource = 'negative transferAmount';
        } else {
            directionSource = 'no direction field found → defaulted to "in"';
        }

        // Parse transaction (không lưu DB)
        const parseResult = await parseTransaction(content, amount, accountName, huongGiaoDich);

        return NextResponse.json({
            debug: true,
            rawPayload: data,
            detectedFields: {
                amount,
                content,
                reference,
                accountName,
                huongGiaoDich,
                directionSource,
            },
            parseResult,
            availableFields: Object.keys(data),
            warning: 'Không lưu vào database — chỉ để debug'
        }, { status: 200 });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

// GET để kiểm tra endpoint còn sống
export async function GET() {
    const blocked = debugGuard();
    if (blocked) return blocked;
    return NextResponse.json({
        info: 'Webhook Debug Inspector',
        usage: 'POST với payload JSON giống SePay webhook',
        example: {
            transferAmount: 200000,
            transferType: 'out',
            transferContent: 'Chi phi san cau thang 6',
            referenceCode: 'TEST001',
            accountName: 'CLB PICKLEBALL 246'
        }
    });
}
