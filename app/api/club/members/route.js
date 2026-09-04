import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase, requireValidatedGroupAdmin } from '@/lib/groupSession';

export async function GET() {
    const groupId = getGroupIdForDatabase();
    const { data, error } = await supabaseAdmin
        .from('club_members')
        .select('*')
        .eq('group_id', groupId)
        .order('full_name', { ascending: true });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ members: data || [] });
}

export async function POST(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const fullName = String(body?.full_name || '').trim();
    if (!fullName) {
        return NextResponse.json({ error: 'Tên thành viên là bắt buộc.' }, { status: 400 });
    }
    const aliases = Array.isArray(body?.aliases) && body.aliases.length > 0 ? body.aliases : null;

    const { data, error } = await supabaseAdmin
        .from('club_members')
        .insert([{ group_id: adminCheck.groupId, full_name: fullName.toUpperCase(), aliases }])
        .select('id, full_name, aliases, is_active')
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ member: data });
}

export async function PATCH(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const id = body?.id;
    if (!id) {
        return NextResponse.json({ error: 'Thiếu id thành viên.' }, { status: 400 });
    }
    const updates = {};
    if (Array.isArray(body?.aliases)) {
        updates.aliases = body.aliases.length > 0 ? body.aliases : null;
    }
    if (typeof body?.is_active === 'boolean') {
        updates.is_active = body.is_active;
    }
    if (typeof body?.full_name === 'string' && body.full_name.trim()) {
        updates.full_name = body.full_name.trim().toUpperCase();
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Không có thay đổi.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from('club_members')
        .update(updates)
        .eq('id', id)
        .eq('group_id', adminCheck.groupId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
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
        .from('club_members')
        .delete()
        .eq('id', id)
        .eq('group_id', adminCheck.groupId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
