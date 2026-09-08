const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app/api/club/bxh/share-image/route.js'), 'utf8');

assert(/getGroupIdForDatabase|requireValidatedGroup/.test(src), 'Phải lấy group_id từ phiên');
assert(!/searchParams\.get\(['"]group/.test(src), 'Tuyệt đối không nhận group_id từ tham số URL');
assert(/no-store/.test(src), 'Ảnh chứa dữ liệu riêng, phải Cache-Control no-store');
assert(/private/.test(src), 'Cache-Control phải là private');
assert(/image\/png/.test(src), 'Phải trả image/png');
assert(/runtime\s*=\s*['"]nodejs['"]/.test(src), 'Route phải chạy trên nodejs để đọc Supabase và font local');
assert(/ImageResponse/.test(src), 'Route phải render bằng ImageResponse');
assert(/from ['"]next\/og['"]/.test(src), 'ImageResponse phải được import từ next/og');
assert(/readFileSync/.test(src), 'Font phải được đọc tường minh từ filesystem');
assert(/Montserrat-SemiBold\.ttf/.test(src) && /Montserrat-Bold\.ttf/.test(src), 'Phải nạp đủ font Montserrat tiếng Việt');
assert(/VŨ NGỌC HƯNG|ĐẶNG TIẾN ANH/.test(src) || /font/.test(src), 'Contract phải bao phủ glyph tiếng Việt có dấu');
assert(/400/.test(src), 'Tham số period sai phải trả 400');
assert(!/searchParams\.get\(['"]board/.test(src), 'Không còn tham số board — chỉ còn một bảng');
assert(/loadContributionInputs/.test(src), 'Phải dùng chung đường đọc dữ liệu với giao diện');

console.log('bxh-share-image: PASS');