const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const m008 = read('database/migrations/008_group_members.sql');
assert(
    m008.includes('CREATE TABLE IF NOT EXISTS group_members') &&
    m008.includes('user_id uuid') &&
    m008.includes('REFERENCES auth.users') &&
    m008.includes('group_id') &&
    m008.includes("role") &&
    m008.includes('UNIQUE (group_id, user_id)'),
    'Migration 008 should create group_members linking auth.users to groups with a role and a unique membership.'
);

const membership = read('lib/membership.js');
assert(
    membership.includes('export async function getAdminGroupIds') &&
    membership.includes('export async function isGroupAdmin') &&
    membership.includes("from('group_members')"),
    'lib/membership.js should resolve a user\'s admin group ids and check admin membership.'
);

const createGroupRoute = read('app/api/groups/route.js');
assert(
    createGroupRoute.includes('auth.admin.createUser') &&
    createGroupRoute.includes('addGroupMember') &&
    createGroupRoute.includes('adminEmail'),
    'Group creation should create a Supabase admin user and an owner membership.'
);
const homePage = read('app/page.js');
assert(
    homePage.includes('adminEmail'),
    'Create-group form should collect the admin email.'
);

console.log('multitenant phase 2 contract ok');
