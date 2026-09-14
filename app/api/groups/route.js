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

const CODE_ALPHABET_RE = /^[A-Z0-9]+$/;

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

async function assertCodeAvailable(code) {
    const { data, error } = await db
        .from('groups')
        .select('id')
        .eq('code', code)
        .maybeSingle();

    if (error) throw error;
    if (data) {
        const conflict = new Error('Mã CLB này đã được sử dụng. Vui lòng chọn mã khác.');
        conflict.status = 409;
        throw conflict;
    }
}

function validateCustomCode(rawCode) {
    const code = normalizeGroupCode(rawCode);
    if (!code) return null;
    if (code.length < 3 || code.length > 16) {
        const err = new Error('Mã CLB cần từ 3 đến 16 ký tự.');
        err.status = 400;
        throw err;
    }
    if (!CODE_ALPHABET_RE.test(code)) {
        const err = new Error('Mã CLB chỉ gồm chữ cái A–Z và số 0–9 (không dấu, không khoảng trắng).');
        err.status = 400;
        throw err;
    }
    return code;
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
        const venue = String(body?.venue || '').trim();
        const adminPassword = String(body?.adminPassword || '');
        const memberPassword = String(body?.memberPassword || '');

        if (!name) {
            return NextResponse.json({ error: 'Tên CLB là bắt buộc.' }, { status: 400 });
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

        const customCode = validateCustomCode(body?.code);
        const code = customCode || normalizeGroupCode(await createUniqueGroupCode());
        if (customCode) {
            await assertCodeAvailable(customCode);
        }

        const { data: group, error } = await db
            .from('groups')
            .insert({
                code,
                name,
                description: description || null,
                venue: venue || null,
                admin_password_hash: hashPassword(adminPassword),
                member_password_hash: hashPassword(memberPassword),
            })
            .select('id, code, name, description, venue, access_version')
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json(
                    { error: 'Mã CLB này đã được sử dụng. Vui lòng chọn mã khác.' },
                    { status: 409 },
                );
            }
            throw error;
        }

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
        const status = error.status || 500;
        return NextResponse.json(
            { error: error.message || 'Không thể tạo nhóm.' },
            { status }
        );
    }
}
