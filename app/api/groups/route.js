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
import { setGroupSessionCookie } from '@/lib/groupSession';
import { issueClubSession } from '@/lib/identityRuntime';
import { consumeRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rateLimit';

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
        const rate = consumeRateLimit(
            `group-create:${getClientIdentifier(request)}`,
            { limit: 5, windowMs: 5 * 60_000 },
        );
        if (!rate.allowed) return rateLimitResponse(rate);

        const body = await request.json();
        const name = String(body?.name || '').trim();
        const description = String(body?.description || '').trim();
        const adminPassword = String(body?.adminPassword || '');
        const memberPassword = String(body?.memberPassword || '');

        if (!name) {
            return NextResponse.json({ error: 'Tên nhóm là bắt buộc.' }, { status: 400 });
        }
        if (adminPassword.length < 6) {
            return NextResponse.json({ error: 'Mật khẩu admin cần ít nhất 6 ký tự.' }, { status: 400 });
        }
        if (memberPassword.length < 4) {
            return NextResponse.json({ error: 'Mật khẩu thành viên cần ít nhất 4 ký tự.' }, { status: 400 });
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
            .select('id, code, name, description, access_version')
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

        const issuedSession = await issueClubSession({
            groupId: group.id,
            groupCode: group.code,
            groupName: group.name,
            role: 'admin',
            accessVersion: group.access_version || 1,
        });
        setGroupSessionCookie(response, issuedSession.token);

        return response;
    } catch (error) {
        console.error('Create group failed:', error);
        return NextResponse.json(
            { error: error.message || 'Không thể tạo nhóm.' },
            { status: 500 }
        );
    }
}
