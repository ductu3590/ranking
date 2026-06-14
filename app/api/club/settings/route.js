import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';
import { hashPassword } from '@/lib/groupAuth';

async function buildJoin(request, code) {
    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const joinUrl = `${origin}/join?group=${code}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
        margin: 1,
        width: 320,
        color: { dark: '#101820', light: '#ffffff' },
    });
    return { joinUrl, qrCodeDataUrl };
}

export async function GET(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .select('id, code, name, description, logo_url')
        .eq('id', adminCheck.groupId)
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { joinUrl, qrCodeDataUrl } = await buildJoin(request, group.code);
    return NextResponse.json({ group, joinUrl, qrCodeDataUrl });
}

export async function PATCH(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const updates = {};
    if (typeof body?.name === 'string' && body.name.trim()) {
        updates.name = body.name.trim();
    }
    if (typeof body?.description === 'string') {
        updates.description = body.description.trim() || null;
    }
    if (typeof body?.memberPassword === 'string' && body.memberPassword) {
        if (body.memberPassword.length < 4) {
            return NextResponse.json({ error: 'Mật khẩu thành viên cần ít nhất 4 ký tự.' }, { status: 400 });
        }
        updates.member_password_hash = hashPassword(body.memberPassword);
    }
    if ('logoUrl' in (body || {})) {
        const logoUrl = body.logoUrl;
        if (logoUrl === null || logoUrl === '') {
            updates.logo_url = null;
        } else if (typeof logoUrl === 'string') {
            if (logoUrl.length > 100000) {
                return NextResponse.json({ error: 'Logo quá lớn — hãy chọn ảnh nhỏ hơn.' }, { status: 400 });
            }
            updates.logo_url = logoUrl;
        }
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Không có thay đổi.' }, { status: 400 });
    }

    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .update(updates)
        .eq('id', adminCheck.groupId)
        .select('id, code, name, description, logo_url')
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ group });
}
