import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase, requireValidatedGroupAdmin } from '@/lib/groupSession';

export async function GET() {
    const groupId = getGroupIdForDatabase();
    const { data, error } = await supabaseAdmin
        .from('quy_pickleball')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ transactions: data || [] });
}

const ALLOWED_UPDATE_FIELDS = [
    'loai_giao_dich',
    'huong_giao_dich',
    'is_manually_categorized',
    'nguoi_nop',
    'noi_dung_goc',
    'admin_note',
    'so_tien',
];

export async function POST(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const amount = Math.abs(parseFloat(body?.so_tien) || 0);
    if (!amount) {
        return NextResponse.json({ error: 'Số tiền không hợp lệ.' }, { status: 400 });
    }
    if (!String(body?.noi_dung || '').trim()) {
        return NextResponse.json({ error: 'Nội dung là bắt buộc.' }, { status: 400 });
    }

    const isIncome = body?.direction === 'in';
    const row = {
        group_id: adminCheck.groupId,
        ma_giao_dich: `${isIncome ? 'MANUAL_THU' : 'MANUAL_CHI'}_${Date.now()}`,
        so_tien: isIncome ? amount : -amount,
        noi_dung_goc: String(body.noi_dung).trim(),
        nguoi_nop: 'THỦ QUỸ',
        loai_giao_dich: body?.loai_giao_dich || 'khac',
        huong_giao_dich: isIncome ? 'in' : 'out',
        is_manually_categorized: true,
        admin_note: String(body?.ghi_chu || '').trim() || null,
        confidence_score: 100,
        parsing_method: 'manual',
        created_at: body?.ngay_giao_dich
            ? new Date(body.ngay_giao_dich).toISOString()
            : new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from('quy_pickleball').insert([row]);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

export async function PATCH(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) {
        return NextResponse.json({ error: 'Thiếu danh sách giao dịch.' }, { status: 400 });
    }

    const updates = {};
    for (const key of ALLOWED_UPDATE_FIELDS) {
        if (body?.updates && key in body.updates) {
            updates[key] = body.updates[key];
        }
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Không có trường hợp lệ để cập nhật.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from('quy_pickleball')
        .update(updates)
        .in('id', ids)
        .eq('group_id', adminCheck.groupId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
