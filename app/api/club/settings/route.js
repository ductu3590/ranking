import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { hashPassword } from '@/lib/groupAuth';
import { nextAccessVersion } from '@/lib/domain/identity/session';

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

function safeGroupForClient(group) {
    const { sepay_webhook_secret: sepayWebhookSecret, ...safeGroup } = group;
    return {
        ...safeGroup,
        hasSepayWebhookSecret: Boolean(sepayWebhookSecret),
    };
}

export async function GET(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .select('id, code, name, description, logo_url, sepay_webhook_secret, access_version')
        .eq('id', adminCheck.groupId)
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { joinUrl, qrCodeDataUrl } = await buildJoin(request, group.code);
    return NextResponse.json({ group: safeGroupForClient(group), joinUrl, qrCodeDataUrl });
}

export async function PATCH(request) {
    const adminCheck = await requireValidatedGroupAdmin();
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
    if (typeof body?.adminPassword === 'string' && body.adminPassword) {
        if (body.adminPassword.length < 6) {
            return NextResponse.json({ error: 'Mật khẩu admin cần ít nhất 6 ký tự.' }, { status: 400 });
        }
        updates.admin_password_hash = hashPassword(body.adminPassword);
    }
    if ('logoUrl' in (body || {})) {
        const logoUrl = body.logoUrl;
        if (logoUrl === null || logoUrl === '') {
            updates.logo_url = null;
        } else if (typeof logoUrl === 'string') {
            if (logoUrl.length > 100000) {
                return NextResponse.json({ error: 'Logo quá lớn, hãy chọn ảnh nhỏ hơn.' }, { status: 400 });
            }
            updates.logo_url = logoUrl;
        }
    }
    if (body?.clearSepayWebhookSecret === true) {
        updates.sepay_webhook_secret = null;
    } else if (typeof body?.sepayWebhookSecret === 'string' && body.sepayWebhookSecret.trim()) {
        const secret = body.sepayWebhookSecret.trim();
        if (secret.length < 16) {
            return NextResponse.json({ error: 'Secret webhook SePay cần ít nhất 16 ký tự.' }, { status: 400 });
        }
        updates.sepay_webhook_secret = secret;
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Không có thay đổi.' }, { status: 400 });
    }

    if (updates.admin_password_hash || updates.member_password_hash) {
        updates.access_version = nextAccessVersion(adminCheck.session?.access_version || 1);
    }

    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .update(updates)
        .eq('id', adminCheck.groupId)
        .select('id, code, name, description, logo_url, sepay_webhook_secret, access_version')
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ group: safeGroupForClient(group) });
}
