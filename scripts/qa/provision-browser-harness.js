'use strict';

// Dung moi truong cho harness trinh duyet (tests/unified-setup/wizard-journey.browser.test.js).
//
//   node scripts/qa/provision-browser-harness.js <duong-dan-file-env>
//
// Tao HAI CLB kiem thu rieng qua CHINH endpoint cong khai cua ung dung
// (POST /api/groups), roi dang nhap that (POST /api/groups/join) de lay cookie
// `group_session`. Khong dung mat khau cua bat ky ai, khong bia cookie.
//
// AN TOAN:
//   * Mat khau sinh ngau nhien MOI LAN CHAY, chi nam trong bo nho va trong file
//     env ma nguoi chay chi dinh. KHONG BAO GIO ghi vao repo — hay dat file env
//     ngoai cay ma nguon (vi du thu muc tam cua he dieu hanh).
//   * Chi in ra manifest id (khong bi mat) de doi chieu va don dep.
//   * Khong dung toi bat ky CLB nao dang hoat dong.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.PICKHUB_QA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const OUT = process.argv[2];
if (!OUT) {
    console.error('Cach dung: node scripts/qa/provision-browser-harness.js <duong-dan-file-env>');
    process.exit(2);
}
if (path.resolve(OUT).startsWith(path.resolve(__dirname, '..', '..'))) {
    console.error('Tu choi: file env phai nam NGOAI cay ma nguon de khong bao gio bi commit.');
    process.exit(2);
}

const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 12);
const runSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
const password = () => crypto.randomBytes(12).toString('base64url');

async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return { status: response.status, body, headers: response.headers };
}

function sessionCookie(headers) {
    const raw = headers.getSetCookie ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
    for (const line of raw) {
        const match = /(?:^|;\s*)group_session=([^;]+)/.exec(line);
        if (match) return decodeURIComponent(match[1]);
    }
    return null;
}

async function login(code, secret) {
    const result = await jsonFetch(`${BASE}/api/groups/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, password: secret }),
    });
    if (result.status !== 200) throw new Error(`dang nhap ${code} that bai: ${result.status}`);
    const token = sessionCookie(result.headers);
    if (!token) throw new Error(`khong nhan duoc cookie group_session cho ${code}`);
    return token;
}

async function createClub(label, code) {
    const adminPassword = password();
    const memberPassword = password();
    const created = await jsonFetch(`${BASE}/api/groups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            name: label,
            code,
            description: 'CLB kiem thu tu dong — se duoc xoa sau khi chay xong',
            adminPassword,
            memberPassword,
        }),
    });
    if (![200, 201].includes(created.status)) {
        throw new Error(`tao CLB ${code} that bai: ${created.status} ${JSON.stringify(created.body)}`);
    }
    const group = created.body.group || created.body;
    return {
        group,
        adminToken: await login(code, adminPassword),
        adminTokenB: await login(code, adminPassword),
        memberToken: await login(code, memberPassword),
    };
}

(async () => {
    const codeA = `QAH${stamp.slice(-5)}${runSuffix}A`;
    const codeB = `QAH${stamp.slice(-5)}${runSuffix}B`;
    const a = await createClub('CLB QA harness — tenant A', codeA);
    const b = await createClub('CLB QA harness — tenant B', codeB);

    const lines = [
        `export PICKHUB_QA_BASE_URL='${BASE}'`,
        `export PICKHUB_QA_GROUP_ID='${a.group.id}'`,
        `export PICKHUB_QA_ADMIN_SESSION='${a.adminToken}'`,
        `export PICKHUB_QA_ADMIN_SESSION_B='${a.adminTokenB}'`,
        `export PICKHUB_QA_MEMBER_SESSION='${a.memberToken}'`,
        `export PICKHUB_QA_TENANT_B_GROUP_ID='${b.group.id}'`,
        `export PICKHUB_QA_TENANT_B_SESSION='${b.adminToken}'`,
    ];
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });

    console.log(JSON.stringify({
        tenant_a: { group_id: a.group.id, code: codeA },
        tenant_b: { group_id: b.group.id, code: codeB },
        env_file: path.resolve(OUT),
        note: 'Don dep: node scripts/qa/cleanup-browser-harness.js ' + [a.group.id, b.group.id].join(' '),
    }, null, 2));
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
