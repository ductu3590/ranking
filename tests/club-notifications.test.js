const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const parserSrc = fs.readFileSync(path.join(root, 'lib/transaction-parser.js'), 'utf8');

assert(
    !/memberName\s*=\s*normalizeText\(accountName\.substring/.test(parserSrc),
    'Parser không được ghi nội dung ngân hàng vào nguoi_nop; phải ghi "Unknown"'
);
assert(
    (parserSrc.match(/memberName\s*=\s*'Unknown'/g) || []).length >= 2,
    'Cả hai nhánh fallback (fallback_raw và no_match) phải ghi "Unknown"'
);
assert(
    /parsingMethod\s*=\s*'no_match'/.test(parserSrc),
    'Vẫn giữ parsingMethod để chẩn đoán'
);

console.log('club-notifications (parser): PASS');

const webhook = fs.readFileSync(path.join(root, 'app/api/webhook/route.js'), 'utf8');
assert(/club_notifications/.test(webhook), 'Webhook phải sinh thông báo khi không khớp roster');
assert(/try\s*\{[\s\S]*club_notifications[\s\S]*catch/.test(webhook),
    'Việc ghi thông báo phải nằm trong try/catch để không làm hỏng việc ghi giao dịch');

const route = fs.readFileSync(path.join(root, 'app/api/club/notifications/route.js'), 'utf8');
assert(/requireValidatedGroupAdmin/.test(route), 'Route thông báo phải yêu cầu quyền admin');
assert(/\.eq\('group_id'/.test(route), 'Route thông báo phải scope theo group_id');

const bell = fs.readFileSync(path.join(root, 'components/pickhub/PhNotificationBell.js'), 'utf8');
assert(/aria-label/.test(bell), 'Chuông phải có aria-label');
assert(/PhModal/.test(bell) || /role="dialog"/.test(bell), 'Panel chuông phải dùng contract dialog');

console.log('club-notifications: PASS');