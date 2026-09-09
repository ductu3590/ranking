const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
}

function getLogoutBlock(source, endMarker) {
    const start = source.indexOf('async function handleLogout');
    const end = source.indexOf(endMarker, start);
    return start >= 0 && end > start ? source.slice(start, end) : '';
}

const badge = read('components/UserStatusBadge.js');
const badgeLogout = getLogoutBlock(badge, "if (state.kind === 'loading')");
assert(
    badgeLogout.includes("method: 'DELETE'") &&
    !badgeLogout.includes("removeItem('teamfund-current-group')"),
    'Homepage continuation requires the account-menu logout to preserve the remembered group.'
);

// app/quy/admin da bi go trong dot dieu huong 2026-09-09: khong con man hinh
// so quy rieng nen cung khong con handleLogout rieng. Duong dang xuat duy nhat
// la menu tai khoan, da duoc assert ngay phia tren.

console.log('homepage continuation logout contract ok');
