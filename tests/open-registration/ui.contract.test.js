const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

// F0: css
assert(exists('app/dk/openreg.css'), 'openreg.css tồn tại');

// F1: trang danh sách giải cộng đồng
const idx = 'app/dk/page.js';
assert(exists(idx), 'app/dk/page.js tồn tại');
const idxs = read(idx);
assert(idxs.includes("'use client'") || idxs.includes('"use client"'), 'client component');
assert(idxs.includes('listCommunityTournaments'), 'gọi listCommunityTournaments');
assert(idxs.includes('/dk/'), 'link tới trang đăng ký theo slug');

// F2: form đăng ký theo slug + division
const form = 'app/dk/[slug]/[division]/page.js';
assert(exists(form), 'trang form đăng ký tồn tại');
const fs2 = read(form);
assert(fs2.includes("'use client'") || fs2.includes('"use client"'), 'client component');
assert(fs2.includes('getPublicRegistration'), 'tải cấu hình nội dung');
assert(fs2.includes('submitPublicRegistration'), 'nộp đăng ký');
assert(fs2.includes('company') || fs2.includes('honeypot'), 'có honeypot chống bot');
assert(/full_name/.test(fs2) && /phone/.test(fs2), 'thu thập tên + SĐT');

// F3: trang theo dõi trạng thái
const track = 'app/dk/theo-doi/page.js';
assert(exists(track), 'trang theo dõi tồn tại');
const ts = read(track);
assert(ts.includes('getRegistrationStatus'), 'gọi getRegistrationStatus');
assert(ts.includes('token') || ts.includes('phone'), 'tra theo token/SĐT');

// G1: OpenRegTab
const tab = 'app/giai-dau/v2/console/tabs/OpenRegTab.js';
assert(exists(tab), 'OpenRegTab tồn tại');
const tabs = read(tab);
assert(tabs.includes('getRegistrationBoard'), 'tải bảng duyệt');
assert(tabs.includes('reviewOpenRegistration'), 'gọi duyệt');
for (const a of ['admit', 'remove', 'restore']) assert(tabs.includes(a), 'nút hành động ' + a);

// G1: wired vào console
const con = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
assert(con.includes('OpenRegTab'), 'console render OpenRegTab');
assert(con.includes('openreg'), 'có tab key openreg');
assert(con.includes("organizer_mode") && con.includes("community"), 'chỉ hiện với giải community');

console.log('open-registration ui contract: OK');
