'use strict';

// Live integration test cho luồng đăng ký tài khoản VĐV + liên kết athlete/membership.
// Chạy thật qua PostgREST (repository thật, không fake) để bắt lớp bug mà unit test
// với fake repository không thấy — ví dụ `ilike` coi '_' là wildcard khi check trùng
// login, hay unique violation 23505 rơi vào lỗi 500.
//
// Yêu cầu: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY trong .env.local (migration 048
// đã apply nên PostgREST đọc/ghi được athlete_accounts). Thiếu key hoặc chưa có CLB
// test thì tự SKIP để không làm vỡ CI.
//
// An toàn dữ liệu:
// - Chỉ dùng 2 CLB test cố định có code AATESTA0 / AATESTB0 (xem README ở cuối file).
//   Test tự kiểm tra code trước khi ghi; không khớp thì SKIP.
// - Seed athlete trực tiếp vào athletes + club_memberships, KHÔNG chạm club_members
//   (bảng đó có trigger BEFORE DELETE soft-delete nên rác sẽ không xoá được).
// - Dọn sạch cả trước và sau khi chạy, scope đúng club_id test. KHÔNG DROP/TRUNCATE.

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const { createSupabaseIdentityRepository } = require('../../lib/repositories/identity/compatibilityRepository');
const {
    createListClaimableAthletes,
    createRegisterAthleteAccount,
} = require('../../lib/application/identity/athleteAccounts');
const { verifyPassword } = require('../../lib/domain/identity/password');

// groups.code bị ràng buộc đúng 8 ký tự nên hai CLB test mang hậu tố '0'.
const CLUB_A_CODE = 'AATESTA0';
const CLUB_B_CODE = 'AATESTB0';
const SEED_PREFIX = 'ZZTEST AA';
const PASSWORD = 'MatKhau@12345';

function loadEnvLocal() {
    const envPath = path.join(__dirname, '..', '..', '.env.local');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

let checks = 0;
function assert(cond, msg) {
    checks += 1;
    if (!cond) throw new Error('FAIL: ' + msg);
}

async function expectIdentityError(promise, code, label) {
    let caught = null;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    assert(caught, `${label}: phải throw nhưng lại thành công`);
    assert(caught.code === code, `${label}: mong code=${code}, nhận ${caught.code} (${caught.message})`);
    return caught;
}

function makeSession(group, overrides = {}) {
    const now = Date.now();
    return {
        group_id: group.id,
        group_code: group.code,
        role: 'member',
        issued_at: now - 1000,
        expires_at: now + 10 * 60 * 1000,
        session_version: 1,
        access_version: Number(group.access_version),
        ...overrides,
    };
}

async function main() {
    loadEnvLocal();
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        console.log('athlete-accounts live: SKIP (thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
        return;
    }

    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const repository = createSupabaseIdentityRepository(db);
    const listClaimable = createListClaimableAthletes({ repository });
    const register = createRegisterAthleteAccount({ repository });

    const { data: clubs, error: clubError } = await db.from('groups')
        .select('id, code, name, access_version').in('code', [CLUB_A_CODE, CLUB_B_CODE]);
    if (clubError) throw clubError;
    const clubA = (clubs || []).find((row) => row.code === CLUB_A_CODE);
    const clubB = (clubs || []).find((row) => row.code === CLUB_B_CODE);
    if (!clubA || !clubB) {
        console.log(`athlete-accounts live: SKIP (cần 2 CLB test ${CLUB_A_CODE} / ${CLUB_B_CODE})`);
        return;
    }
    const clubIds = [clubA.id, clubB.id];
    const suffix = String(Date.now()).slice(-6);

    // Xoá rác của lần chạy trước (nếu process bị kill giữa đường) và của lần này.
    async function cleanup(label) {
        const { data: seeded } = await db.from('club_memberships')
            .select('athlete_id').in('club_id', clubIds);
        const athleteIds = (seeded || []).map((row) => row.athlete_id);
        const steps = [
            ['athlete_accounts', db.from('athlete_accounts').delete({ count: 'exact' }).in('club_id', clubIds)],
            ['club_memberships', db.from('club_memberships').delete({ count: 'exact' }).in('club_id', clubIds)],
        ];
        const summary = [];
        for (const [name, query] of steps) {
            const { error, count } = await query;
            summary.push(`${name}=${error ? 'ERR ' + error.message : count}`);
        }
        if (athleteIds.length) {
            const { error, count } = await db.from('athletes')
                .delete({ count: 'exact' }).in('id', athleteIds).like('display_name', `${SEED_PREFIX}%`);
            summary.push(`athletes=${error ? 'ERR ' + error.message : count}`);
        }
        console.log(`cleanup ${label}: ${summary.join(' ')}`);
    }

    async function seedAthlete(club, label, effectiveFrom = null) {
        // Ghi thẳng athletes + club_memberships: đúng hình dạng dữ liệu mà service đọc,
        // nhưng bỏ qua club_members để rác test luôn xoá được.
        const displayName = `${SEED_PREFIX} ${label}`;
        const { data: athlete, error: athleteError } = await db.from('athletes')
            .insert({ display_name: displayName, normalized_name: displayName.toLowerCase(), status: 'unclaimed' })
            .select('id, display_name, status').single();
        if (athleteError) throw athleteError;
        const { data: membership, error: membershipError } = await db.from('club_memberships').insert({
            club_id: club.id,
            athlete_id: athlete.id,
            status: 'active',
            effective_from: effectiveFrom || new Date().toISOString().slice(0, 10),
            club_alias: displayName,
        }).select('id, club_id, athlete_id, status, club_alias, version').single();
        if (membershipError) throw membershipError;
        return { athlete, membership };
    }

    await cleanup('trước khi chạy');

    try {
        const happy = await seedAthlete(clubA, 'Happy');
        const underscore = await seedAthlete(clubA, 'Underscore');
        const dupLogin = await seedAthlete(clubA, 'Duplicate');
        // effective_from lùi quá khứ vì club_memberships_check đòi effective_to > effective_from.
        const ended = await seedAthlete(clubA, 'Ended', '2020-01-01');
        const race = await seedAthlete(clubA, 'Race');
        const otherClub = await seedAthlete(clubB, 'OtherClub');

        {
            const { error } = await db.from('club_memberships')
                .update({ status: 'ended', effective_to: new Date().toISOString().slice(0, 10) })
                .eq('id', ended.membership.id)
                .eq('club_id', clubA.id);
            if (error) throw error;
        }

        const sessionA = makeSession(clubA);
        const sessionB = makeSession(clubB);

        // ---- 1. Danh sách claimable chỉ gồm hồ sơ active + chưa có tài khoản ----
        const initial = await listClaimable({ session: sessionA });
        const initialIds = initial.map((row) => row.membershipId);
        assert(initialIds.includes(happy.membership.id), 'claimable phải chứa hồ sơ active');
        assert(!initialIds.includes(ended.membership.id), 'claimable không được chứa hồ sơ đã rời CLB');
        assert(!initialIds.includes(otherClub.membership.id), 'claimable không được lẫn hồ sơ CLB khác');
        assert(initial.every((row) => row.athleteStatus === 'unclaimed'), 'claimable chỉ gồm athlete unclaimed');

        // ---- 2. Happy path: đăng ký + liên kết ----
        const happyLogin = `abxc${suffix}`;
        const account = await register({
            session: sessionA,
            login: happyLogin,
            password: PASSWORD,
            displayName: 'Nguyễn Văn Test',
            membershipId: happy.membership.id,
        });
        assert(account.login === happyLogin, 'login trả về phải khớp');
        assert(account.displayName === 'Nguyễn Văn Test', 'displayName trả về phải khớp');
        assert(Number(account.clubId) === Number(clubA.id), 'account phải thuộc đúng CLB của session');
        assert(Number(account.athleteId) === Number(happy.athlete.id), 'account phải trỏ đúng athlete');
        assert(Number(account.membershipId) === Number(happy.membership.id), 'account phải trỏ đúng membership');
        assert(account.status === 'active', 'account mới phải ở trạng thái active');

        // ---- 3. Mật khẩu được hash, verify được, không lưu plaintext ----
        {
            const { data, error } = await db.from('athlete_accounts')
                .select('password_hash').eq('id', account.id).single();
            if (error) throw error;
            assert(!data.password_hash.includes(PASSWORD), 'password_hash không được chứa plaintext');
            assert(verifyPassword(PASSWORD, data.password_hash), 'verifyPassword phải khớp mật khẩu đã đăng ký');
            assert(!verifyPassword('SaiMatKhau@1', data.password_hash), 'verifyPassword phải từ chối mật khẩu sai');
        }

        // ---- 4. athlete chuyển sang 'linked' và rời khỏi danh sách claimable ----
        {
            const { data, error } = await db.from('athletes').select('status').eq('id', happy.athlete.id).single();
            if (error) throw error;
            assert(data.status === 'linked', `athlete phải chuyển sang linked, nhận ${data.status}`);
        }
        const afterLink = await listClaimable({ session: sessionA });
        assert(!afterLink.map((row) => row.membershipId).includes(happy.membership.id),
            'hồ sơ đã liên kết phải biến khỏi danh sách claimable');
        assert(afterLink.length === initial.length - 1, 'danh sách claimable phải giảm đúng 1 hồ sơ');

        // ---- 5. Regression bug ilike: login chứa '_' không bị coi là trùng ----
        // Với `ilike`, 'ab_c...' khớp sai 'abxc...' đã tạo ở bước 2 → báo trùng oan.
        const underscoreLogin = `ab_c${suffix}`;
        const underscoreAccount = await register({
            session: sessionA,
            login: underscoreLogin,
            password: PASSWORD,
            displayName: 'Trần Thị Test',
            membershipId: underscore.membership.id,
        });
        assert(underscoreAccount.login === underscoreLogin, `login '${underscoreLogin}' phải được chấp nhận`);

        // ---- 6. Trùng login (không phân biệt hoa/thường) → 409 ----
        await expectIdentityError(register({
            session: sessionA,
            login: happyLogin.toUpperCase(),
            password: PASSWORD,
            displayName: 'Lê Văn Test',
            membershipId: dupLogin.membership.id,
        }), 'VERSION_CONFLICT', 'trùng login');

        // ---- 7. Hồ sơ đã có tài khoản → 409 ----
        await expectIdentityError(register({
            session: sessionA,
            login: `taken${suffix}`,
            password: PASSWORD,
            displayName: 'Phạm Văn Test',
            membershipId: happy.membership.id,
        }), 'VERSION_CONFLICT', 'athlete đã được liên kết');

        // ---- 8. Membership của CLB khác → 404 (group scoping) ----
        await expectIdentityError(register({
            session: sessionA,
            login: `cross${suffix}`,
            password: PASSWORD,
            displayName: 'Vũ Văn Test',
            membershipId: otherClub.membership.id,
        }), 'NOT_FOUND', 'membership thuộc CLB khác');

        // Chiều ngược lại: session CLB B không chạm được hồ sơ CLB A.
        await expectIdentityError(register({
            session: sessionB,
            login: `cross2${suffix}`,
            password: PASSWORD,
            displayName: 'Vũ Văn Test 2',
            membershipId: race.membership.id,
        }), 'NOT_FOUND', 'session CLB B không được liên kết hồ sơ CLB A');

        // ---- 9. Membership đã rời CLB → 404 ----
        await expectIdentityError(register({
            session: sessionA,
            login: `endedm${suffix}`,
            password: PASSWORD,
            displayName: 'Đỗ Văn Test',
            membershipId: ended.membership.id,
        }), 'NOT_FOUND', 'membership đã ended');

        // ---- 10. Input thiếu / sai định dạng → 400 ----
        const invalidInputs = [
            [{ login: '', password: PASSWORD, displayName: 'A B', membershipId: race.membership.id }, 'login rỗng'],
            [{ login: 'hợp lệ', password: PASSWORD, displayName: 'A B', membershipId: race.membership.id }, 'login sai định dạng'],
            [{ login: `ok${suffix}`, password: '1234567', displayName: 'A B', membershipId: race.membership.id }, 'mật khẩu 7 ký tự'],
            [{ login: `ok${suffix}`, password: PASSWORD, displayName: '   ', membershipId: race.membership.id }, 'thiếu họ tên'],
            [{ login: `ok${suffix}`, password: PASSWORD, displayName: 'A B', membershipId: -1 }, 'membershipId âm'],
            [{ login: `ok${suffix}`, password: PASSWORD, displayName: 'A B', membershipId: null }, 'thiếu membershipId'],
        ];
        for (const [payload, label] of invalidInputs) {
            await expectIdentityError(register({ session: sessionA, ...payload }), 'INVALID_INPUT', label);
        }

        // ---- 11. Session không hợp lệ ----
        await expectIdentityError(register({
            session: null, login: `nosess${suffix}`, password: PASSWORD, displayName: 'A B', membershipId: race.membership.id,
        }), 'SESSION_UNAUTHORIZED', 'không có session');
        await expectIdentityError(listClaimable({ session: null }), 'SESSION_UNAUTHORIZED', 'liệt kê khi chưa có session');
        await expectIdentityError(register({
            session: makeSession(clubA, { signed: false }),
            login: `unsigned${suffix}`, password: PASSWORD, displayName: 'A B', membershipId: race.membership.id,
        }), 'SESSION_UNAUTHORIZED', 'session chưa ký');
        await expectIdentityError(register({
            session: makeSession(clubA, { issued_at: Date.now() - 2000, expires_at: Date.now() - 1000 }),
            login: `expired${suffix}`, password: PASSWORD, displayName: 'A B', membershipId: race.membership.id,
        }), 'SESSION_EXPIRED', 'session hết hạn');
        // access_version lệch = CLB đã đổi mật khẩu → mọi session cũ bị thu hồi.
        await expectIdentityError(register({
            session: makeSession(clubA, { access_version: Number(clubA.access_version) + 1 }),
            login: `revoked${suffix}`, password: PASSWORD, displayName: 'A B', membershipId: race.membership.id,
        }), 'SESSION_REVOKED', 'session bị thu hồi qua access_version');

        // ---- 12. Race condition: unique index chặn ở DB → 409, không phải 500 ----
        // Giả lập 2 request song song: bỏ qua bước đọc kiểm tra trùng để insert
        // chạm thẳng unique index lower(login).
        const blindRepository = {
            ...repository,
            findAthleteAccountByLogin: async () => null,
            findAthleteAccountByAthleteId: async () => null,
        };
        const raceError = await expectIdentityError(
            createRegisterAthleteAccount({ repository: blindRepository })({
                session: sessionA,
                login: happyLogin,
                password: PASSWORD,
                displayName: 'Hoàng Văn Test',
                membershipId: race.membership.id,
            }),
            'VERSION_CONFLICT',
            'unique violation khi đua request',
        );
        assert(raceError.status === 409, `unique violation phải trả 409, nhận ${raceError.status}`);
        assert(/đăng nhập|VĐV/i.test(raceError.message), 'thông báo lỗi phải bằng tiếng Việt cho người dùng');

        console.log(`athlete-accounts live: all ${checks} checks passed`);
    } finally {
        await cleanup('sau khi chạy');
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
