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

const m011 = read('database/migrations/011_group_sepay_webhook_secret.sql');
assert(
    m011.includes('ALTER TABLE groups') &&
    m011.includes('sepay_webhook_secret') &&
    m011.includes('sepay_webhook_secret IS NULL') &&
    m011.includes("btrim(sepay_webhook_secret) <> ''"),
    'Migration 011 should add an optional per-group SePay webhook secret.'
);

const webhook = read('app/api/webhook/route.js');
assert(
    webhook.includes('group_bank_accounts') &&
    webhook.includes('accountNumber') &&
    webhook.includes('account_number') &&
    !webhook.includes('const groupId = DEFAULT_GROUP_ID;'),
    'Webhook should resolve group_id from group_bank_accounts by accountNumber (not hardcode the default).'
);
assert(
    !webhook.includes("from '@/lib/groupConstants'") &&
    webhook.includes('Unknown bank account') &&
    webhook.includes('{ status: 422 }'),
    'Webhook should reject unknown bank accounts instead of falling back to the default group.'
);
// Thuat toan chu ky da duoc tach sang lib/sepayWebhookAuth.js de nhanh "Gui thu"
// dung chung mot nguon, tranh hai nhanh lech nhau. Kiem o dung noi no nam,
// nhung van khoa bat bien: webhook xac thuc HMAC bang secret cua dung CLB.
const webhookAuth = read('lib/sepayWebhookAuth.js');
assert(
    webhook.includes('checkWebhookAuth') &&
    !webhook.includes('createHmac') &&
    !webhook.includes('SEPAY_WEBHOOK_SECRET') &&
    webhook.includes('sepay_webhook_secret') &&
    webhook.includes('rawBody'),
    'Webhook should verify signatures through the shared auth module using the matched group secret.'
);
assert(
    webhookAuth.includes('X-SePay-Signature') &&
    webhookAuth.includes('X-SePay-Timestamp') &&
    webhookAuth.includes('createHmac') &&
    webhookAuth.includes('timingSafeEqual') &&
    webhookAuth.includes('rawBody'),
    'Shared auth module should implement SePay HMAC-SHA256 verification.'
);

const bankApi = read('app/api/club/bank-accounts/route.js');
assert(
    bankApi.includes('export async function GET') &&
    bankApi.includes('export async function POST') &&
    bankApi.includes('export async function DELETE') &&
    bankApi.includes('requireValidatedGroupAdmin') &&
    bankApi.includes('group_bank_accounts'),
    'Bank-accounts route should expose admin-guarded GET/POST/DELETE on group_bank_accounts.'
);

// Phan SePay da chuyen sang components/pickhub/SepayConnect.js: khoa bao mat do
// he thong sinh (randomBytes 32) thay vi admin tu nghi ra, va xac minh bang
// chuc nang "Gui thu" cua SePay. Nut "Tat bao mat" da bo khoi UI — muc tieu la
// moi CLB deu co khoa; API /api/club/settings van con clearSepayWebhookSecret.
const settingsUi = read('app/admin/ClubSettings.js');
const sepayConnectUi = read('components/pickhub/SepayConnect.js');
const verifyApi = read('app/api/club/sepay/verify/route.js');
assert(
    settingsUi.includes('/api/club/bank-accounts') &&
    settingsUi.includes('Tài khoản ngân hàng') &&
    settingsUi.includes('SepayConnect'),
    'ClubSettings should manage bank accounts and mount the SePay connection flow.'
);
assert(
    sepayConnectUi.includes('/api/club/sepay/verify') &&
    sepayConnectUi.includes('/api/club/bank-accounts') &&
    sepayConnectUi.includes('HMAC-SHA256') &&
    verifyApi.includes('randomBytes(32)'),
    'SePay connection flow should own the per-club webhook secret and bank account wiring.'
);

// Huong dan SePay da chuyen han sang SepayConnect. Khoa bat bien moi: co huong
// dan tung buoc, co kieu xac thuc HMAC-SHA256, va co duong lui nhap tay so tai
// khoan. Khoi "Secret webhook rieng cua CLB" bi bo vi khoa gio do he thong sinh.
const sepayGuideUi = read('components/pickhub/SepayConnect.js');
assert(
    sepayGuideUi.includes('SePay') &&
    sepayGuideUi.includes('HMAC-SHA256') &&
    sepayGuideUi.includes('Gửi thử') &&
    sepayGuideUi.includes('my.sepay.vn'),
    'SepayConnect should show step-by-step SePay setup guidance.'
);

const settingsRoute = read('app/api/club/settings/route.js');
assert(
    settingsRoute.includes('sepayWebhookSecret') &&
    settingsRoute.includes('sepay_webhook_secret') &&
    settingsRoute.includes('hasSepayWebhookSecret') &&
    settingsRoute.includes('clearSepayWebhookSecret'),
    'Settings API should let group admins set or clear their per-club SePay webhook secret.'
);

console.log('multitenant phase 5 contract ok');
