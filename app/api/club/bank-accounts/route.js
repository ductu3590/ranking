import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';

export async function GET() {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const { data, error } = await supabaseAdmin
        .from('group_bank_accounts')
        .select('id, account_number, bank_name, label, is_active, created_at')
        .eq('group_id', adminCheck.groupId)
        .order('created_at', { ascending: true });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ accounts: data || [] });
}

export async function POST(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const accountNumber = String(body?.accountNumber || '').trim();
    if (!accountNumber) {
        return NextResponse.json({ error: 'Số tài khoản là bắt buộc.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from('group_bank_accounts')
        .insert({
            group_id: adminCheck.groupId,
            account_number: accountNumber,
            bank_name: (body?.bankName || '').trim() || null,
            label: (body?.label || '').trim() || null,
        })
        .select('id, account_number, bank_name, label, is_active, created_at')
        .single();
    if (error) {
        if (error.code === '23505') {
            return NextResponse.json({ error: 'Số tài khoản này đã được đăng ký (có thể bởi CLB khác).' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ account: data });
}

export async function DELETE(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'Thiếu id.' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
        .from('group_bank_accounts')
        .delete()
        .eq('id', id)
        .eq('group_id', adminCheck.groupId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
