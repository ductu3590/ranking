import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';

// QR nhan quy chi danh cho phien CLB hop le (thanh vien hoac admin).
// Khong dua vao /api/club/branding vi route do phuc vu ca khach chua dang nhap.
export async function GET() {
    const session = await getValidatedGroupSessionFromCookies();
    if (!session?.group_id) {
        return NextResponse.json({ error: 'Cần phiên CLB hợp lệ.' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
        .from('groups')
        .select('fund_qr_url')
        .eq('id', session.group_id)
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ fundQrUrl: data?.fund_qr_url || null });
}
