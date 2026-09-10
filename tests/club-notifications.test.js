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
assert(/createPortal/.test(bell) && /ph-notification-layer/.test(bell), 'Chuông phải dùng lớp portal độc lập trên cùng');
assert(!/PhModal/.test(bell), 'Chuông không được gọi modal chung của trang');
assert(/setError/.test(bell) && /Không tải được thông báo/.test(bell), 'Chuông phải thông báo rõ khi tải việc cần xử lý thất bại');
assert(fs.existsSync(path.join(root, 'components/pickhub/PhNotificationBell.css')), 'Panel chuông có CSS lớp riêng');
const bellCss = fs.readFileSync(path.join(root, 'components/pickhub/PhNotificationBell.css'), 'utf8');
assert(/z-index:\s*1000/.test(bellCss) && !/ph-notification-layer[^}]*background:\s*var\(--ph-backdrop\)/.test(bellCss), 'Panel chuông ở lớp trên cùng và không phủ backdrop modal');

const modal = fs.readFileSync(path.join(root, 'components/pickhub/PhModal.js'), 'utf8');
assert(/aria-label="Đóng"/.test(modal) && /onClick=\{onClose\}/.test(modal), 'Modal thông báo phải có nút đóng nhìn thấy');
const primitives = fs.readFileSync(path.join(root, 'app/styles/primitives.css'), 'utf8');
assert(/\.ph-modal\s*\{[^}]*position:\s*relative/.test(primitives), 'Nút đóng phải được neo trong khung modal');

const rail = fs.readFileSync(path.join(root, 'components/pickhub/SideRail.js'), 'utf8');
assert(/aria-haspopup="menu"/.test(rail) && /Đăng xuất/.test(rail), 'Thẻ quản trị viên phải mở menu tài khoản có Đăng xuất');
assert(/fetch\('\/api\/groups\/session', \{ method: 'DELETE' \}\)/.test(rail), 'Đăng xuất menu trái phải xoá group session trên server');
const appShellCss = fs.readFileSync(path.join(root, 'components/pickhub/AppShell.css'), 'utf8');
assert(/\.ph-usercard__name[^}]*white-space:\s*nowrap/.test(appShellCss), 'Tên quản trị viên không được xuống dòng');
assert(/\.ph-usercard__role[^}]*white-space:\s*nowrap/.test(appShellCss), 'Vai trò quản trị viên không được xuống dòng');

console.log('club-notifications: PASS');
