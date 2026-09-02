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

const fundAdmin = read('app/quy/admin/page.js');
const fundLogout = getLogoutBlock(fundAdmin, 'if (loading)');
assert(
    fundLogout.includes("method: 'DELETE'") &&
    !fundLogout.includes("removeItem('teamfund-current-group')"),
    'Homepage continuation requires the fund-admin logout to preserve the remembered group.'
);

console.log('homepage continuation logout contract ok');
