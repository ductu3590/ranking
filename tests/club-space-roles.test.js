'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

// /quy phai gate moi thao tac quy bang canManageFund
const quyPage = read('app/quy/page.js');
assert.match(quyPage, /canManageFund/, '/quy phai doc quyen canManageFund tu session');
assert.match(quyPage, /FundTransactionList/, '/quy phai dung danh sach dong-the');
assert.match(quyPage, /FundEntryForm/, '/quy phai co modal ghi thu\\/chi');
assert.match(quyPage, /FundTransactionEditor/, '/quy phai co modal sua giao dich');
assert.match(quyPage, /AssignTransactionDialog/, '/quy phai co hop thoai gan nguoi nop');
assert.doesNotMatch(quyPage, /<table/, '/quy khong duoc dung bang cho danh sach giao dich');

// /thanh-vien phai gate cot Quan ly bang canManageRoster
const membersPage = read('app/thanh-vien/page.js');
assert.match(membersPage, /canManageRoster/, '/thanh-vien phai doc quyen canManageRoster');

// Hai man hinh trung gian da bi go
assert.equal(exists('app/quy/admin'), false, 'app/quy/admin phai bi xoa');
assert.equal(exists('app/quy/members'), false, 'app/quy/members phai bi xoa');
assert.equal(exists('app/quy/bxh'), false, 'app/quy/bxh phai bi xoa');
assert.equal(
    exists('app/api/club/settings/regenerate-code/route.js'),
    false,
    'endpoint tao lai ma CLB phai bi xoa, khong chi giau nut',
);

const adminPage = read('app/admin/page.js');
assert.doesNotMatch(adminPage, /admin-center-tabs/, '/admin khong con thanh tab');
assert.match(adminPage, /LEGACY_SECTION_TARGET/, '/admin phai chuyen huong section roster va fund cu');

console.log('club space role contract ok');
