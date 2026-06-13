import { NextResponse } from 'next/server';
import { getEffectiveGroupContext } from '@/lib/groupSession';

export async function GET() {
    return NextResponse.json({
        session: getEffectiveGroupContext(),
    });
}
