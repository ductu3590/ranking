import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Returns the list of group ids a Supabase Auth user administers.
export async function getAdminGroupIds(userId) {
    if (!userId) return [];
    const { data, error } = await supabaseAdmin
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId);
    if (error) throw error;
    return (data || []).map((row) => row.group_id);
}

// True when the user is an admin/owner of the given group.
export async function isGroupAdmin(userId, groupId) {
    if (!userId || !groupId) return false;
    const { data, error } = await supabaseAdmin
        .from('group_members')
        .select('id')
        .eq('user_id', userId)
        .eq('group_id', groupId)
        .maybeSingle();
    if (error) throw error;
    return Boolean(data);
}

// Links a Supabase user to a group as owner/admin (idempotent).
export async function addGroupMember(userId, groupId, role = 'admin') {
    const { error } = await supabaseAdmin
        .from('group_members')
        .upsert({ user_id: userId, group_id: groupId, role }, { onConflict: 'group_id,user_id' });
    if (error) throw error;
}
