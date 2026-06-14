import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getEffectiveGroupContext } from '@/lib/groupSession';

// Public: members and logged-out visitors read their active club's branding.
// Only non-sensitive fields (name, logo) are exposed.
export async function GET() {
    const context = getEffectiveGroupContext();
    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .select('id, name, logo_url')
        .eq('id', context.group_id)
        .single();
    if (error) {
        return NextResponse.json({ name: context.group_name || null, logoUrl: null });
    }
    return NextResponse.json({ name: group.name, logoUrl: group.logo_url || null });
}
