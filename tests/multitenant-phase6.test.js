const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const tx = read('app/api/club/transactions/route.js');
assert(
    tx.includes('export async function POST') &&
    tx.includes('export async function PATCH') &&
    tx.includes('requireGroupAdmin') &&
    tx.includes('MANUAL_THU') &&
    tx.includes('MANUAL_CHI'),
    'Club transactions route should support admin-guarded manual create (Thu/Chi) and update/bulk.'
);

const mem = read('app/api/club/members/route.js');
assert(
    mem.includes('export async function POST') &&
    mem.includes('export async function PATCH') &&
    mem.includes('export async function DELETE') &&
    mem.includes('requireGroupAdmin'),
    'Club members route should support admin-guarded create/update/delete.'
);

console.log('multitenant phase 6 contract ok');
