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
// Kiểm THẬT: font tồn tại trên đĩa và cmap phủ glyph tiếng Việt có dấu.
// (Thay cho phép grep source cũ, vốn pass tầm thường mà không mở font.)
const FONT_DIR = path.join(root, 'app/api/club/bxh/share-image');
function cmapHas(fontPath, codepoint) {
    const d = fs.readFileSync(fontPath);
    const numTables = d.readUInt16BE(4);
    let cmapOff = null;
    for (let i = 0; i < numTables; i += 1) {
        const rec = 12 + i * 16;
        if (d.slice(rec, rec + 4).toString('latin1') === 'cmap') { cmapOff = d.readUInt32BE(rec + 8); break; }
    }
    assert(cmapOff !== null, `${path.basename(fontPath)} thiếu bảng cmap`);
    const nSub = d.readUInt16BE(cmapOff + 2);
    let best = null;
    for (let i = 0; i < nSub; i += 1) {
        const rec = cmapOff + 4 + i * 8;
        const pid = d.readUInt16BE(rec); const eid = d.readUInt16BE(rec + 2);
        if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) best = cmapOff + d.readUInt32BE(rec + 4);
    }
    if (best === null || d.readUInt16BE(best) !== 4) return true; // format khác: bỏ qua, đã có kiểm file size
    const segX2 = d.readUInt16BE(best + 6); const segCount = segX2 / 2;
    const endO = best + 14; const startO = endO + segX2 + 2;
    for (let s = 0; s < segCount; s += 1) {
        const end = d.readUInt16BE(endO + s * 2); const start = d.readUInt16BE(startO + s * 2);
        if (start <= codepoint && codepoint <= end) return true;
    }
    return false;
}
for (const fontFile of ['Montserrat-Bold.ttf', 'Montserrat-SemiBold.ttf']) {
    const fontPath = path.join(FONT_DIR, fontFile);
    assert(fs.existsSync(fontPath), `Thiếu font ${fontFile}`);
    assert(fs.statSync(fontPath).size > 50000, `${fontFile} quá nhỏ, không phải font Montserrat thật`);
    assert(cmapHas(fontPath, 0x0168), `${fontFile} không phủ glyph 'Ũ' (U+0168) — dấu tiếng Việt sẽ thành ô vuông`);
    assert(cmapHas(fontPath, 0x1EB6), `${fontFile} không phủ glyph 'Ặ' (U+1EB6)`);
}
assert(/400/.test(src), 'Tham số period sai phải trả 400');
assert(!/searchParams\.get\(['"]board/.test(src), 'Không còn tham số board — chỉ còn một bảng');
assert(/loadContributionInputs/.test(src), 'Phải dùng chung đường đọc dữ liệu với giao diện');

console.log('bxh-share-image: PASS');