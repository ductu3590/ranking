import { NextResponse } from 'next/server';
import { parseTransaction } from '@/lib/transaction-parser';

export async function POST(req) {
    try {
        const { content, amount, accountName } = await req.json();

        // Parse transaction
        const result = await parseTransaction(content, amount, accountName);

        return NextResponse.json(result, { status: 200 });

    } catch (error) {
        console.error('Test parse error:', error);
        return NextResponse.json({
            error: error.message
        }, { status: 500 });
    }
}
