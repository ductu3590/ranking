const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const settings = read('app/admin/ClubSettings.js');
const styles = read('app/admin/club-settings.css');

assert.match(settings, /className="club-settings__grid"/, 'Cài đặt phải dùng lưới hai cột trên màn hình rộng.');
assert.match(settings, /className="club-settings__left"/, 'Cột trái phải gom phần nhận diện và bảo mật.');
assert.match(settings, /className="club-settings__right"/, 'Cột phải phải gom mã CLB và QR nhận quỹ.');
assert.match(settings, /className="club-settings__automation"/, 'SePay và ngân hàng phải nằm trong hàng tự động hoá riêng.');
assert.match(settings, /id="set-brand"/, 'Nhận diện phải giữ neo điều hướng hiện có.');
assert.match(settings, /id="set-code"/, 'Mã CLB phải giữ neo điều hướng hiện có.');
assert.match(settings, /id="set-pw-admin"/, 'Mật khẩu quản trị phải giữ neo điều hướng hiện có.');
assert.match(settings, /id="set-pw-member"/, 'Mật khẩu thành viên phải giữ neo điều hướng hiện có.');
assert.match(settings, /id="set-qr"/, 'QR nhận quỹ phải giữ neo điều hướng hiện có.');
assert.match(settings, /id="set-sepay"/, 'SePay phải giữ neo điều hướng hiện có.');
assert.match(settings, /id="set-bank"/, 'Ngân hàng phải giữ neo điều hướng hiện có.');
assert.match(styles, /\.club-settings__grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'CSS phải định nghĩa lưới hai cột desktop.');
assert.match(styles, /@media \(max-width: 899px\)[\s\S]*\.club-settings__grid\s*\{[\s\S]*grid-template-columns: 1fr/, 'CSS phải xếp một cột trên màn hình nhỏ.');
assert.match(styles, /var\(--ph-card\)/, 'Layout mới phải tiếp tục dùng token bề mặt PickHub.');
assert.match(styles, /var\(--ph-indigo\)/, 'Layout mới phải tiếp tục dùng token màu PickHub.');

console.log('admin layout redesign contract ok');
