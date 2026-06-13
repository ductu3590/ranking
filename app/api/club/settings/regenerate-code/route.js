import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';
import { generateGroupCode, normalizeGroupCode } from '@/lib/groupAuth';

async function createUniqueGroupCode() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = normalizeGroupCode(generateGroupCode());
        const { data, error } = await supabaseAdmin
            .from('groups')
            .select('id')
            .eq('code', code)
            .maybeSingle();
        if (error) throw error;
        if (!data) return code;
    }
    throw new Error('Không thể tạo mã nhóm duy nhất. Vui lòng thử lại.');
}

export async function POST(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const code = await createUniqueGroupCode();
    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .update({ code })
        .eq('id', adminCheck.groupId)
        .select('id, code, name')
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const joinUrl = `${origin}/join?group=${group.code}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
        margin: 1,
        width: 320,
        color: { dark: '#101820', light: '#ffffff' },
    });
    return NextResponse.json({ code: group.code, joinUrl, qrCodeDataUrl });
}
