const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const m010 = read('database/migrations/010_group_bank_accounts.sql');
assert(
    m010.includes('CREATE TABLE IF NOT EXISTS group_bank_accounts') &&
    m010.includes('account_number text') &&
    m010.includes('UNIQUE (account_number)') &&
    m010.includes('REFERENCES groups') &&
    m010.includes('ENABLE ROW LEVEL SECURITY') &&
    m010.includes('gm.user_id = auth.uid()'),
    'Migration 010 should create group_bank_accounts with a unique account_number, FK to groups, and RLS scoped by membership.'
);

const webhook = read('app/api/webhook/route.js');
assert(
    webhook.includes('group_bank_accounts') &&
    webhook.includes('accountNumber') &&
    webhook.includes('account_number') &&
    !webhook.includes('const groupId = DEFAULT_GROUP_ID;'),
    'Webhook should resolve group_id from group_bank_accounts by accountNumber (not hardcode the default).'
);

const bankApi = read('app/api/club/bank-accounts/route.js');
assert(
    bankApi.includes('export async function GET') &&
    bankApi.includes('export async function POST') &&
    bankApi.includes('export async function DELETE') &&
    bankApi.includes('requireGroupAdmin') &&
    bankApi.includes('group_bank_accounts'),
    'Bank-accounts route should expose admin-guarded GET/POST/DELETE on group_bank_accounts.'
);

const settingsUi = read('app/admin/ClubSettings.js');
assert(
    settingsUi.includes('/api/club/bank-accounts') &&
    settingsUi.includes('Tài khoản ngân hàng'),
    'ClubSettings should manage bank accounts for auto fund collection.'
);

console.log('multitenant phase 5 contract ok');
