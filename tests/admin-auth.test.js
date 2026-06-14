const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
}

// Admin pages reached after joining a group must gate on the group session
// role, not the legacy Supabase Auth session (which bounced users to /login).
for (const route of ['app/quy/admin/page.js', 'app/giai-dau/admin/page.js']) {
    const src = read(route);
    assert(
        !src.includes("'/login'"),
        `${route} should not redirect to the legacy Supabase /login page.`
    );
    assert(
        !src.includes('supabase.auth.'),
        `${route} should not gate access with Supabase Auth.`
    );
    assert(
        src.includes('getCurrentGroupClient'),
        `${route} should read the current group session role for access control.`
    );
    assert(
        src.includes("role !== 'admin'"),
        `${route} should reject sessions whose role is not admin.`
    );
}

// Logging out should clear the group session cookie instead of Supabase Auth.
const sessionRoute = read('app/api/groups/session/route.js');
assert(
    sessionRoute.includes('export async function DELETE') &&
    sessionRoute.includes('clearGroupSessionCookie'),
    'Group session route should clear the session cookie on logout via DELETE.'
);

const groupSession = read('lib/groupSession.js');
assert(
    groupSession.includes('export function clearGroupSessionCookie'),
    'Group session helper should expose clearGroupSessionCookie.'
);

// The status badge should reflect the current group + role, not Supabase Auth.
const badge = read('components/UserStatusBadge.js');
assert(
    badge.includes('teamfund-current-group'),
    'UserStatusBadge should read the current group session from storage.'
);
assert(
    !badge.includes('supabase.auth') && !badge.includes('@/lib/supabaseClient'),
    'UserStatusBadge should not depend on Supabase Auth for admin account state.'
);
assert(
    badge.includes('/api/groups/session') &&
    badge.includes("method: 'DELETE'") &&
    badge.includes("removeItem('teamfund-current-group')") &&
    badge.includes('user-badge-logout'),
    'UserStatusBadge account menu should expose group-session logout.'
);
assert(
    badge.includes('Thành viên') && badge.includes('Quản trị'),
    'UserStatusBadge should label both admin and member group roles.'
);

const fundAdmin = read('app/quy/admin/page.js');
assert(
    fundAdmin.includes('💰 Thu') && fundAdmin.includes('direction'),
    'Fund admin should support manual income (Thu) entry, not just expense.'
);

console.log('admin auth contract ok');
