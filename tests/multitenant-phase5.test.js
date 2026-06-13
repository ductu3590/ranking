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

console.log('multitenant phase 5 contract ok');
