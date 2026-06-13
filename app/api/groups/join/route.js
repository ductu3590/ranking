import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { normalizeGroupCode, publicGroupPayload, verifyPassword } from '@/lib/groupAuth';
import { setGroupSessionCookie, signGroupSession } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

export async function POST(request) {
    try {
        const body = await request.json();
        const code = normalizeGroupCode(body?.code);
        const password = String(body?.password || '');

        if (!code || !password) {
            return NextResponse.json({ error: 'Vui lòng nhập mã nhóm và mật khẩu.' }, { status: 400 });
        }

        const { data: group, error } = await db
            .from('groups')
            .select('id, code, name, description, admin_password_hash, member_password_hash')
            .eq('code', code)
            .maybeSingle();

        if (error) throw error;
        if (!group) {
            return NextResponse.json({ error: 'Không tìm thấy nhóm.' }, { status: 404 });
        }

        let role = null;
        if (verifyPassword(password, group.admin_password_hash)) {
            role = 'admin';
        } else if (verifyPassword(password, group.member_password_hash)) {
            role = 'member';
        }

        if (!role) {
            return NextResponse.json({ error: 'Mật khẩu không đúng.' }, { status: 401 });
        }

        const response = NextResponse.json({
            group: publicGroupPayload(group),
            role,
            redirectTo: role === 'admin' ? '/admin' : '/quy',
        });

        setGroupSessionCookie(response, signGroupSession({
            groupId: group.id,
            groupCode: group.code,
            groupName: group.name,
            role,
        }));

        return response;
    } catch (error) {
        console.error('Join group failed:', error);
        return NextResponse.json(
            { error: error.message || 'Không thể tham gia nhóm.' },
            { status: 500 }
        );
    }
}
