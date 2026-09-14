'use strict';

// E2E quyền ĐỌC dữ liệu CLB bằng vé VĐV, chạy qua HTTP thật trên dev server.
// Khác login.live.integration.test.js (gọi thẳng service): ở đây đi qua route handler,
// cookie và middleware — đúng đường người dùng thật đi.
//
// Câu hỏi test này phải trả lời: mở quyền đọc cho athlete_session có làm rò dữ liệu
// giữa các CLB, hoặc mở nhầm đường ghi, hay không.
//
// Yêu cầu: dev server ở PICKHUB_E2E_BASE (mặc định http://localhost:3000) + SUPABASE_URL
// và SUPABASE_SERVICE_ROLE_KEY trong .env.local. Thiếu thứ nào thì SKIP, không làm vỡ CI.
//
// An toàn dữ liệu: chỉ ghi vào 2 CLB test AATESTA0 / AATESTB0, seed athletes +
// club_memberships + athlete_accounts, dọn trước và sau theo đúng club_id. KHÔNG
// DROP/TRUNCATE, không đụng club_members (trigger soft-delete để lại rác không xoá được).

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const { hashPassword } = require('../../lib/domain/identity/password');

const BASE = process.env.PICKHUB_E2E_BASE || 'http://localhost:3000';
const CLUB_A_CODE = 'AATESTA0';
const CLUB_B_CODE = 'AATESTB0';
const SEED_PREFIX = 'ZZTEST READ';
const PASSWORD = 'MatKhau@12345';

function loadEnvLocal() {
    const envPath = path.join(__dirname, '..', '..', '.env.local');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
}

let checks = 0;
function assert(condition, message) {
    checks += 1;
    if (!condition) throw new Error('FAIL: ' + message);
}

function sessionCookie(response) {
    const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get('set-cookie')];
    const found = (raw || []).filter(Boolean).find((value) => value.startsWith('athlete_session='));
    return found ? found.split(';')[0] : null;
}

async function json(url, options = {}) {
    const response = await fetch(BASE + url, { cache: 'no-store', ...options });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
}

async function main() {
    loadEnvLocal();
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        console.log('athlete-read-access live: SKIP (thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
        return;
    }
    const reachable = await fetch(BASE + '/api/groups/session', { cache: 'no-store' }).then(() => true).catch(() => false);
    if (!reachable) {
        console.log(`athlete-read-access live: SKIP (không có dev server ở ${BASE})`);
        return;
    }

    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: clubs, error: clubError } = await db.from('groups')
        .select('id, code, name').in('code', [CLUB_A_CODE, CLUB_B_CODE]);
    if (clubError) throw clubError;
    const clubA = (clubs || []).find((row) => row.code === CLUB_A_CODE);
    const clubB = (clubs || []).find((row) => row.code === CLUB_B_CODE);
    if (!clubA || !clubB) {
        console.log(`athlete-read-access live: SKIP (cần 2 CLB test ${CLUB_A_CODE} / ${CLUB_B_CODE})`);
        return;
    }
    const clubIds = [clubA.id, clubB.id];

    async function cleanup(label) {
        const { data: memberships } = await db.from('club_memberships').select('athlete_id').in('club_id', clubIds);
        const athleteIds = (memberships || []).map((row) => row.athlete_id);
        const { data: accounts } = await db.from('athlete_accounts').select('id').in('club_id', clubIds);
        if (accounts?.length) {
            await db.from('athlete_account_sessions').delete().in('account_id', accounts.map((row) => row.id));
        }
        await db.from('athlete_accounts').delete().in('club_id', clubIds);
        await db.from('club_memberships').delete().in('club_id', clubIds);
        if (athleteIds.length) {
            await db.from('athletes').delete().in('id', athleteIds).like('display_name', `${SEED_PREFIX}%`);
        }
        console.log(`cleanup ${label}`);
    }

    async function seedMember(club, label) {
        const displayName = `${SEED_PREFIX} ${label}`;
        const { data: athlete, error: athleteError } = await db.from('athletes')
            .insert({ display_name: displayName, normalized_name: displayName.toLowerCase(), status: 'unclaimed' })
            .select('id').single();
        if (athleteError) throw athleteError;
        const { data: membership, error: membershipError } = await db.from('club_memberships').insert({
            club_id: club.id,
            athlete_id: athlete.id,
            status: 'active',
            effective_from: new Date().toISOString().slice(0, 10),
            club_alias: displayName,
        }).select('id').single();
        if (membershipError) throw membershipError;
        return { athleteId: athlete.id, membershipId: membership.id, displayName };
    }

    await cleanup('trước khi chạy');
    const suffix = String(Date.now()).slice(-6);

    try {
        const memberA = await seedMember(clubA, `A ${suffix}`);
        const memberB = await seedMember(clubB, `B ${suffix}`);
        const login = `read${suffix}`;
        const { data: account, error: accountError } = await db.from('athlete_accounts').insert({
            login,
            password_hash: hashPassword(PASSWORD),
            display_name: memberA.displayName,
            athlete_id: memberA.athleteId,
            club_id: clubA.id,
            club_membership_id: memberA.membershipId,
        }).select('id').single();
        if (accountError) throw accountError;

        // --- Khách vãng lai: mốc so sánh, phải KHÔNG có quyền xem CLB ---------------
        const anonSession = await json('/api/groups/session');
        assert(anonSession.body?.permissions?.canViewClub === false, 'khách vãng lai không được có canViewClub');
        const anonRoster = await json('/api/identity/roster');
        assert(anonRoster.status === 401, `khách vãng lai đọc roster phải 401, nhận ${anonRoster.status}`);
        const anonMembers = await json('/api/club/members');
        const anonMemberGroupIds = new Set((anonMembers.body?.members || []).map((row) => row.group_id));

        // --- Đăng nhập VĐV của CLB A ------------------------------------------------
        const loginResponse = await fetch(BASE + '/api/identity/athlete-sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password: PASSWORD }),
        });
        assert(loginResponse.status === 201, `đăng nhập phải 201, nhận ${loginResponse.status}`);
        const cookie = sessionCookie(loginResponse);
        assert(Boolean(cookie), 'đăng nhập phải trả cookie athlete_session');
        const auth = { headers: { cookie } };

        // --- Quyền: xem được, nhưng không quản lý được -------------------------------
        const view = await json('/api/groups/session', auth);
        assert(view.body?.permissions?.canViewClub === true, 'VĐV phải xem được dữ liệu CLB');
        assert(view.body?.session?.role === 'athlete', `role phải là 'athlete', nhận ${view.body?.session?.role}`);
        assert(Number(view.body?.session?.group_id) === Number(clubA.id), 'ngữ cảnh phải trỏ đúng CLB của VĐV');
        for (const flag of ['canManageFund', 'canManageRoster', 'canManagePhr', 'canManageSettings']) {
            assert(view.body.permissions[flag] === false, `VĐV không được có quyền ${flag}`);
        }

        // --- Đọc đúng CLB của mình, không rò sang CLB khác ---------------------------
        const roster = await json('/api/identity/roster', auth);
        assert(roster.status === 200, `VĐV đọc roster phải 200, nhận ${roster.status}`);
        const rosterIds = (roster.body?.roster || []).map((row) => String(row.id));
        assert(rosterIds.includes(String(memberA.membershipId)), 'roster phải có thành viên của CLB mình');
        assert(!rosterIds.includes(String(memberB.membershipId)), 'RÒ DỮ LIỆU: roster lộ thành viên CLB khác');

        const branding = await json('/api/club/branding', auth);
        assert(branding.body?.name === clubA.name, `branding phải là CLB A, nhận ${branding.body?.name}`);

        const members = await json('/api/club/members', auth);
        assert(members.status === 200, `VĐV đọc club/members phải 200, nhận ${members.status}`);
        const memberGroupIds = new Set((members.body?.members || []).map((row) => row.group_id));
        for (const groupId of memberGroupIds) {
            assert(Number(groupId) === Number(clubA.id), `RÒ DỮ LIỆU: club/members trả group_id ${groupId}`);
        }
        // Chốt chặn quan trọng: không được rơi về dữ liệu CLB mặc định như khách vãng lai.
        for (const groupId of anonMemberGroupIds) {
            assert(!memberGroupIds.has(groupId), `RÒ DỮ LIỆU: VĐV nhận dữ liệu của CLB mặc định (${groupId})`);
        }

        const transactions = await json('/api/club/transactions', auth);
        assert(transactions.status === 200, `VĐV đọc giao dịch phải 200, nhận ${transactions.status}`);

        const assessments = await json(`/api/identity/assessments?membershipId=${memberA.membershipId}`, auth);
        assert(assessments.status === 200, `VĐV đọc đánh giá phải 200, nhận ${assessments.status}`);
        assert(
            (assessments.body?.assessments || []).every((row) => row.notes === null),
            'ghi chú đánh giá là của admin, VĐV không được thấy',
        );

        // --- Giải đấu: đọc được giải của CLB mình ------------------------------------
        const anonTournaments = await json('/api/tournament-v2/tournaments');
        assert(anonTournaments.status === 401, `khách vãng lai đọc giải phải 401, nhận ${anonTournaments.status}`);
        const tournaments = await json('/api/tournament-v2/tournaments', auth);
        assert(tournaments.status === 200, `VĐV đọc danh sách giải phải 200, nhận ${tournaments.status}`);
        for (const row of tournaments.body?.tournaments || []) {
            assert(Number(row.group_id) === Number(clubA.id), `RÒ DỮ LIỆU: giải của group_id ${row.group_id}`);
        }

        // --- Đường GHI phải đóng y như cũ -------------------------------------------
        const writes = [
            ['POST', '/api/identity/roster', { displayName: 'ZZTEST HACK', alias: 'hack' }],
            ['PATCH', '/api/identity/roster', { membershipId: memberA.membershipId, alias: 'hack' }],
            ['DELETE', '/api/identity/roster', { membershipId: memberA.membershipId }],
            ['POST', '/api/identity/assessments', { membershipId: memberA.membershipId, skillLevel: 4 }],
            ['POST', '/api/club/members', { full_name: 'ZZTEST HACK' }],
            ['POST', '/api/club/transactions', { so_tien: 1000, noi_dung: 'hack', direction: 'in' }],
            ['POST', '/api/tournament-v2/tournaments', { name: 'ZZTEST HACK', event_date: '2026-12-01' }],
        ];
        for (const [method, route, payload] of writes) {
            const response = await fetch(BASE + route, {
                method,
                headers: { 'Content-Type': 'application/json', cookie },
                body: JSON.stringify(payload),
            });
            assert(
                response.status === 401 || response.status === 403,
                `${method} ${route} phải bị từ chối (401/403), nhận ${response.status}`,
            );
        }
        // Không có bản ghi nào lọt vào CLB test qua các lần thử ghi ở trên.
        const { count: sneakedIn } = await db.from('club_memberships')
            .select('id', { count: 'exact', head: true })
            .in('club_id', clubIds)
            .neq('id', memberA.membershipId)
            .neq('id', memberB.membershipId);
        assert(Number(sneakedIn || 0) === 0, 'route ghi không được tạo dữ liệu nào bằng vé VĐV');

        // --- Trang nội bộ: VĐV vào được, khách vãng lai không -----------------------
        const dashboardAsAthlete = await fetch(BASE + '/giai-dau/v2', { headers: { cookie }, redirect: 'manual' });
        assert(dashboardAsAthlete.status === 200, `VĐV phải vào được dashboard giải, nhận ${dashboardAsAthlete.status}`);
        const dashboardAnon = await fetch(BASE + '/giai-dau/v2', { redirect: 'manual' });
        assert(
            dashboardAnon.status !== 200
                || /truy-cap-bi-tu-choi/.test(await dashboardAnon.clone().text()),
            'khách vãng lai không được render dashboard giải',
        );

        // --- Vô hiệu tài khoản là mất quyền đọc ngay --------------------------------
        await db.from('athlete_accounts').update({ status: 'disabled' }).eq('id', account.id);
        const afterDisable = await json('/api/identity/roster', auth);
        assert(afterDisable.status === 401, `tài khoản bị vô hiệu phải mất quyền đọc, nhận ${afterDisable.status}`);
        const viewAfterDisable = await json('/api/groups/session', auth);
        assert(
            viewAfterDisable.body?.permissions?.canViewClub === false,
            'tài khoản bị vô hiệu không được còn canViewClub',
        );
        await db.from('athlete_accounts').update({ status: 'active' }).eq('id', account.id);

        // --- Đăng xuất là mất quyền đọc --------------------------------------------
        await fetch(BASE + '/api/identity/athlete-sessions', { method: 'DELETE', headers: { cookie } });
        const afterLogout = await json('/api/identity/roster', auth);
        assert(afterLogout.status === 401, `vé đã đăng xuất phải mất quyền đọc, nhận ${afterLogout.status}`);

        console.log(`athlete-read-access live: all ${checks} checks passed`);
    } finally {
        await cleanup('sau khi chạy');
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
