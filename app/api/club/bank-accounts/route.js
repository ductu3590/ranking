import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import fundQr from '@/lib/fundQr';

const { findBank } = fundQr;

export async function GET() {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const { data, error } = await supabaseAdmin
        .from('group_bank_accounts')
        .select('id, account_number, bank_name, bank_code, bank_bin, account_holder, label, is_active, created_at')
        .eq('group_id', adminCheck.groupId)
        .order('created_at', { ascending: true });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ accounts: data || [] });
}

export async function POST(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const accountNumber = String(body?.accountNumber || '').trim();
    if (!accountNumber) {
        return NextResponse.json({ error: 'Số tài khoản là bắt buộc.' }, { status: 400 });
    }

    const bankCode = String(body?.bankCode || '').trim();
    // SUA VONG 3 #9: dung findBank thay vi isSupportedBankCode roi tra cuu lai
    // — tranh insert bank_code ma quen bank_bin (truoc day bank_bin luon NULL
    // cho toi khi ai do goi /api/club/fund-qr/generate, du lieu khong nhat quan).
    const bank = findBank(bankCode);
    const accountHolder = String(body?.accountHolder || '').trim();

    const { data, error } = await supabaseAdmin
        .from('group_bank_accounts')
        .insert({
            group_id: adminCheck.groupId,
            account_number: accountNumber,
            bank_name: (body?.bankName || '').trim() || null,
            bank_code: bank?.code || null,
            bank_bin: bank?.bin || null,
            account_holder: accountHolder || null,
            label: (body?.label || '').trim() || null,
        })
        .select('id, account_number, bank_name, bank_code, bank_bin, account_holder, label, is_active, created_at')
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
    const adminCheck = await requireValidatedGroupAdmin();
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
