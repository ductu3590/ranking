import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import {
    generateGroupCode,
    hashPassword,
    normalizeGroupCode,
    publicGroupPayload,
} from '@/lib/groupAuth';
import { setGroupSessionCookie, signGroupSession } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

async function createUniqueGroupCode() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = generateGroupCode();
        const { data, error } = await db
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
    try {
        const body = await request.json();
        const name = String(body?.name || '').trim();
        const description = String(body?.description || '').trim();
        const adminPassword = String(body?.adminPassword || '');
        const memberPassword = String(body?.memberPassword || '');

        if (!name) {
            return NextResponse.json({ error: 'Tên nhóm là bắt buộc.' }, { status: 400 });
        }
        if (adminPassword.length < 4 || memberPassword.length < 4) {
            return NextResponse.json({ error: 'Mật khẩu cần ít nhất 4 ký tự.' }, { status: 400 });
        }
        if (adminPassword === memberPassword) {
            return NextResponse.json({ error: 'Mật khẩu admin và thành viên phải khác nhau.' }, { status: 400 });
        }

        const code = normalizeGroupCode(await createUniqueGroupCode());
        const { data: group, error } = await db
            .from('groups')
            .insert({
                code,
                name,
                description: description || null,
                admin_password_hash: hashPassword(adminPassword),
                member_password_hash: hashPassword(memberPassword),
            })
            .select('id, code, name, description')
            .single();

        if (error) throw error;

        const origin = request.headers.get('origin') || new URL(request.url).origin;
        const joinUrl = `${origin}/join?group=${group.code}`;
        const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
            margin: 1,
            width: 320,
            color: {
                dark: '#101820',
                light: '#ffffff',
            },
        });

        const response = NextResponse.json({
            group: publicGroupPayload(group),
            role: 'admin',
            joinUrl,
            qrCodeDataUrl,
        });

        setGroupSessionCookie(response, signGroupSession({
            groupId: group.id,
            groupCode: group.code,
            groupName: group.name,
            role: 'admin',
        }));

        return response;
    } catch (error) {
        console.error('Create group failed:', error);
        return NextResponse.json(
            { error: error.message || 'Không thể tạo nhóm.' },
            { status: 500 }
        );
    }
}
