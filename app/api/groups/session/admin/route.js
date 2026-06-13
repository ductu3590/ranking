import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminGroupIds } from '@/lib/membership';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { setGroupSessionCookie, signGroupSession } from '@/lib/groupSession';

// Exchanges a Supabase access token for a group_session cookie scoped to the
// admin's club. Body: { accessToken }.
export async function POST(request) {
    const { accessToken } = await request.json();
    if (!accessToken) {
        return NextResponse.json({ error: 'Thiếu access token.' }, { status: 400 });
    }

    const authClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );
    const { data: { user }, error } = await authClient.auth.getUser();
    if (error || !user) {
        return NextResponse.json({ error: 'Phiên không hợp lệ.' }, { status: 401 });
    }

    const groupIds = await getAdminGroupIds(user.id);
    if (groupIds.length === 0) {
        return NextResponse.json({ error: 'Tài khoản chưa thuộc CLB nào.' }, { status: 403 });
    }

    const { data: group } = await supabaseAdmin
        .from('groups')
        .select('id, code, name')
        .eq('id', groupIds[0])
        .single();

    const response = NextResponse.json({
        group: { id: group.id, code: group.code, name: group.name },
        role: 'admin',
        redirectTo: '/admin',
    });
    setGroupSessionCookie(response, signGroupSession({
        groupId: group.id,
        groupCode: group.code,
        groupName: group.name,
        role: 'admin',
    }));
    return response;
}
