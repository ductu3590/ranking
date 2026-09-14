'use strict';

// Live integration test đóng vòng tài khoản VĐV: đăng ký → đăng nhập → xem hồ sơ
// của chính mình → đăng xuất. Chạy thật qua PostgREST với repository thật, nên bắt
// được lớp lỗi mà fake repository không thấy: tên cột sai, phiên không ghi được vào
// athlete_account_sessions, revoke không khớp hash, hồ sơ join lệch club_id.
//
// Yêu cầu: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY trong .env.local. Thiếu key hoặc
// chưa có CLB test thì tự SKIP để không làm vỡ CI.
//
// An toàn dữ liệu: chỉ ghi vào 2 CLB test cố định AATESTA0 / AATESTB0 (giống
// live.integration.test.js), seed thẳng athletes + club_memberships (không chạm
// club_members vì trigger soft-delete làm rác không xoá được), dọn trước và sau khi
// chạy theo đúng club_id. KHÔNG DROP/TRUNCATE.

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const { createSupabaseIdentityRepository } = require('../../lib/repositories/identity/compatibilityRepository');
const { createRegisterAthleteAccount } = require('../../lib/application/identity/athleteAccounts');
const {
    createAthleteLogin,
    createResolveAthleteSession,
    createAthleteLogout,
    createGetAthleteProfile,
} = require('../../lib/application/identity/athleteSessions');
const {
    signAthleteSession,
    verifyAthleteSession,
    hashAthleteSessionKey,
} = require('../../lib/domain/identity/athleteSession');

const CLUB_A_CODE = 'AATESTA0';
const CLUB_B_CODE = 'AATESTB0';
const SEED_PREFIX = 'ZZTEST AA';
const PASSWORD = 'MatKhau@12345';
const SECRET = 'live-test-athlete-session-secret';

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

function makeSession(group) {
    const now = Date.now();
    return {
        group_id: group.id,
        group_code: group.code,
        role: 'member',
        issued_at: now - 1000,
        expires_at: now + 10 * 60 * 1000,
        session_version: 1,
        access_version: Number(group.access_version),
    };
}

async function main() {
    loadEnvLocal();
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        console.log('athlete-login live: SKIP (thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
        return;
    }

    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const repository = createSupabaseIdentityRepository(db);
    const register = createRegisterAthleteAccount({ repository });
    const login = createAthleteLogin({
        repository,
        signSession: (input) => signAthleteSession(input, SECRET),
    });
    const resolveSession = createResolveAthleteSession({ repository });
    const logout = createAthleteLogout({ repository });
    const getProfile = createGetAthleteProfile({ repository });

    const { data: clubs, error: clubError } = await db.from('groups')
        .select('id, code, name, access_version').in('code', [CLUB_A_CODE, CLUB_B_CODE]);
    if (clubError) throw clubError;
    const clubA = (clubs || []).find((row) => row.code === CLUB_A_CODE);
    const clubB = (clubs || []).find((row) => row.code === CLUB_B_CODE);
    if (!clubA || !clubB) {
        console.log(`athlete-login live: SKIP (cần 2 CLB test ${CLUB_A_CODE} / ${CLUB_B_CODE})`);
        return;
    }
    const clubIds = [clubA.id, clubB.id];
    const suffix = String(Date.now()).slice(-6);

    async function cleanup(label) {
        const { data: seeded } = await db.from('club_memberships')
            .select('athlete_id').in('club_id', clubIds);
        const athleteIds = (seeded || []).map((row) => row.athlete_id);
        const { data: accounts } = await db.from('athlete_accounts')
            .select('id').in('club_id', clubIds);
        const accountIds = (accounts || []).map((row) => row.id);
        const summary = [];
        if (accountIds.length) {
            // Phiên phải xoá trước tài khoản dù FK có ON DELETE CASCADE, để con số
            // báo cáo phản ánh đúng những gì test này tạo ra.
            const { error, count } = await db.from('athlete_account_sessions')
                .delete({ count: 'exact' }).in('account_id', accountIds);
            summary.push(`athlete_account_sessions=${error ? 'ERR ' + error.message : count}`);
        }
        const steps = [
            ['athlete_accounts', db.from('athlete_accounts').delete({ count: 'exact' }).in('club_id', clubIds)],
            ['club_memberships', db.from('club_memberships').delete({ count: 'exact' }).in('club_id', clubIds)],
        ];
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

    async function seedAthlete(club, label) {
        const displayName = `${SEED_PREFIX} ${label}`;
        const { data: athlete, error: athleteError } = await db.from('athletes')
            .insert({ display_name: displayName, normalized_name: displayName.toLowerCase(), status: 'unclaimed' })
            .select('id, display_name, status').single();
        if (athleteError) throw athleteError;
        const { data: membership, error: membershipError } = await db.from('club_memberships').insert({
            club_id: club.id,
            athlete_id: athlete.id,
            status: 'active',
            effective_from: new Date().toISOString().slice(0, 10),
            club_alias: displayName,
        }).select('id, club_id, athlete_id, status, club_alias, version').single();
        if (membershipError) throw membershipError;
        return { athlete, membership };
    }

    await cleanup('trước khi chạy');

    try {
        const seeded = await seedAthlete(clubA, 'Login');
        const otherClub = await seedAthlete(clubB, 'LoginOther');

        const accountLogin = `login${suffix}`;
        const account = await register({
            session: makeSession(clubA),
            login: accountLogin,
            password: PASSWORD,
            displayName: 'Nguyễn Văn Đăng Nhập',
            membershipId: seeded.membership.id,
        });
        assert(Number(account.clubId) === Number(clubA.id), 'tài khoản mới phải thuộc CLB A');

        // ---- 1. Đăng nhập thành công, ghi đúng bản ghi phiên ----
        const session = await login({ login: accountLogin, password: PASSWORD });
        assert(Number(session.account.id) === Number(account.id), 'đăng nhập phải trả về đúng tài khoản');
        assert(session.account.login === accountLogin, 'login trả về phải khớp');
        assert(Number(session.account.clubId) === Number(clubA.id), 'phiên phải gắn đúng club_id');
        assert(Number(session.account.membershipId) === Number(seeded.membership.id), 'phiên phải gắn đúng membership');
        assert(session.account.password_hash === undefined, 'không được trả password_hash ra ngoài');
        assert(typeof session.cookieValue === 'string' && session.cookieValue.includes('.'), 'phải phát cookie đã ký');

        const token = verifyAthleteSession(session.cookieValue, SECRET);
        assert(token, 'cookie phát ra phải verify được bằng cùng secret');
        assert(Number(token.account_id) === Number(account.id), 'vé phải mang đúng account_id');
        assert(Number(token.club_id) === Number(clubA.id), 'vé phải mang đúng club_id');

        // Đăng nhập bằng chữ HOA vẫn vào được (login được normalize).
        const upper = await login({ login: accountLogin.toUpperCase(), password: PASSWORD });
        assert(Number(upper.account.id) === Number(account.id), 'login chữ HOA phải vào cùng tài khoản');

        {
            const { data: rows, error } = await db.from('athlete_account_sessions')
                .select('id, account_id, session_key_hash, revoked_at, expires_at')
                .eq('account_id', account.id);
            if (error) throw error;
            assert(rows.length === 2, `phải có 2 bản ghi phiên sau 2 lần đăng nhập, nhận ${rows.length}`);
            const matching = rows.find((row) => row.session_key_hash === hashAthleteSessionKey(token.session_key));
            assert(matching, 'phiên trong DB phải khớp hash khoá trong vé');
            assert(matching.revoked_at === null, 'phiên mới không được ở trạng thái đã thu hồi');
            // Khoá phiên thô không bao giờ được ghi xuống DB, chỉ có hash.
            assert(!rows.some((row) => row.session_key_hash === token.session_key), 'DB chỉ được lưu hash, không lưu khoá thô');
        }

        // ---- 2. Sai thông tin đăng nhập ----
        await expectIdentityError(login({ login: accountLogin, password: 'SaiMatKhau@1' }), 'ATHLETE_CREDENTIALS_INVALID', 'sai mật khẩu');
        await expectIdentityError(login({ login: `khong-ton-tai-${suffix}`, password: PASSWORD }), 'ATHLETE_CREDENTIALS_INVALID', 'login không tồn tại');
        await expectIdentityError(login({ login: '', password: '' }), 'ATHLETE_CREDENTIALS_INVALID', 'thiếu thông tin');
        // Regression: '_' và '%' không được coi là wildcard khi tra login.
        await expectIdentityError(
            login({ login: accountLogin.replace(/^l/, '_'), password: PASSWORD }),
            'ATHLETE_CREDENTIALS_INVALID',
            "login chứa '_' không được khớp wildcard",
        );
        await expectIdentityError(login({ login: '%', password: PASSWORD }), 'ATHLETE_CREDENTIALS_INVALID', "login '%' không được khớp mọi tài khoản");

        // ---- 3. Phiên hợp lệ resolve được, hồ sơ đúng của chính mình ----
        const resolved = await resolveSession(token);
        assert(Number(resolved.account.id) === Number(account.id), 'resolve phải trả về đúng tài khoản');

        const profile = await getProfile(token);
        assert(profile.account.login === accountLogin, 'hồ sơ phải là của chính tài khoản đăng nhập');
        assert(Number(profile.club.id) === Number(clubA.id), 'hồ sơ phải thuộc đúng CLB');
        assert(profile.club.code === CLUB_A_CODE, 'hồ sơ phải mang mã CLB đúng');
        assert(Number(profile.membership.id) === Number(seeded.membership.id), 'hồ sơ phải trỏ đúng membership');
        assert(Number(profile.athlete.id) === Number(seeded.athlete.id), 'hồ sơ phải trỏ đúng athlete');
        assert(profile.athlete.status === 'linked', 'athlete phải chuyển sang linked sau khi đăng ký');
        assert(profile.membership.status === 'active', 'membership phải còn active');
        assert(profile.account.password_hash === undefined, 'hồ sơ không được chứa password_hash');

        // ---- 4. Vé giả mạo / sai secret / sai account đều bị chặn ----
        assert(verifyAthleteSession(session.cookieValue, 'secret-khac') === null, 'vé ký bằng secret khác phải bị từ chối');
        await expectIdentityError(resolveSession(null), 'ATHLETE_SESSION_UNAUTHORIZED', 'không có vé');
        // Vé tự ký cho tài khoản khác: chữ ký hợp lệ nhưng không có phiên nào trong DB.
        const forgedToken = verifyAthleteSession(
            signAthleteSession({
                accountId: Number(account.id) + 100000,
                clubId: Number(clubA.id),
                athleteId: Number(seeded.athlete.id),
                membershipId: Number(seeded.membership.id),
                sessionKey: 'khoa-phien-tu-nghi-ra-du-dai-32-ky-tu',
            }, SECRET),
            SECRET,
        );
        await expectIdentityError(resolveSession(forgedToken), 'ATHLETE_SESSION_UNAUTHORIZED', 'vé trỏ tài khoản không tồn tại');
        // Vé đúng account nhưng khoá phiên không có trong DB.
        await expectIdentityError(
            resolveSession({ ...token, session_key: 'khoa-phien-khong-ton-tai-32-ky-tu' }),
            'ATHLETE_SESSION_UNAUTHORIZED',
            'khoá phiên không có trong DB',
        );

        // ---- 5. Không đăng nhập được vào hồ sơ CLB khác ----
        // Hồ sơ CLB B chưa có tài khoản nào, và tài khoản CLB A không thể chạm tới nó.
        assert(
            Number(profile.membership.id) !== Number(otherClub.membership.id),
            'hồ sơ trả về không được là membership của CLB khác',
        );
        {
            const { data: rows, error } = await db.from('athlete_accounts')
                .select('id').eq('club_id', clubB.id);
            if (error) throw error;
            assert(rows.length === 0, 'CLB B không được có tài khoản nào trong test này');
        }

        // ---- 6. Tài khoản bị tạm ngưng thì không đăng nhập được, phiên cũ cũng chết ----
        {
            const { error } = await db.from('athlete_accounts')
                .update({ status: 'disabled' }).eq('id', account.id);
            if (error) throw error;
            await expectIdentityError(login({ login: accountLogin, password: PASSWORD }), 'ATHLETE_ACCOUNT_DISABLED', 'tài khoản bị tạm ngưng');
            await expectIdentityError(resolveSession(token), 'ATHLETE_SESSION_REVOKED', 'phiên cũ của tài khoản bị tạm ngưng');
            await expectIdentityError(getProfile(token), 'ATHLETE_SESSION_REVOKED', 'hồ sơ của tài khoản bị tạm ngưng');
            const { error: restoreError } = await db.from('athlete_accounts')
                .update({ status: 'active' }).eq('id', account.id);
            if (restoreError) throw restoreError;
        }

        // ---- 7. access_version tăng thì vé cũ hết giá trị ----
        {
            const { error } = await db.from('athlete_accounts')
                .update({ access_version: 2 }).eq('id', account.id);
            if (error) throw error;
            await expectIdentityError(resolveSession(token), 'ATHLETE_SESSION_REVOKED', 'vé cũ khi access_version tăng');
            // Đăng nhập lại thì vé mới mang access_version mới và dùng được.
            const renewed = await login({ login: accountLogin, password: PASSWORD });
            const renewedToken = verifyAthleteSession(renewed.cookieValue, SECRET);
            assert(Number(renewedToken.access_version) === 2, 'vé mới phải mang access_version hiện tại');
            const renewedResolved = await resolveSession(renewedToken);
            assert(Number(renewedResolved.account.id) === Number(account.id), 'vé mới phải resolve được');
        }

        // ---- 8. Đăng xuất thu hồi đúng một phiên, các phiên khác còn sống ----
        {
            const first = await login({ login: accountLogin, password: PASSWORD });
            const second = await login({ login: accountLogin, password: PASSWORD });
            const firstToken = verifyAthleteSession(first.cookieValue, SECRET);
            const secondToken = verifyAthleteSession(second.cookieValue, SECRET);

            assert((await logout(firstToken)).revoked === true, 'đăng xuất phải thu hồi được phiên');
            await expectIdentityError(resolveSession(firstToken), 'ATHLETE_SESSION_REVOKED', 'phiên đã đăng xuất');
            const stillAlive = await resolveSession(secondToken);
            assert(Number(stillAlive.account.id) === Number(account.id), 'phiên khác không được bị thu hồi lây');

            // Đăng xuất lần hai trên cùng vé: không còn gì để thu hồi.
            assert((await logout(firstToken)).revoked === false, 'thu hồi lại phiên đã thu hồi phải trả false');
            assert((await logout(null)).revoked === false, 'đăng xuất khi không có vé phải trả false');

            const { data: rows, error } = await db.from('athlete_account_sessions')
                .select('session_key_hash, revoked_at').eq('account_id', account.id);
            if (error) throw error;
            const firstRow = rows.find((row) => row.session_key_hash === hashAthleteSessionKey(firstToken.session_key));
            const secondRow = rows.find((row) => row.session_key_hash === hashAthleteSessionKey(secondToken.session_key));
            assert(firstRow && firstRow.revoked_at !== null, 'phiên đăng xuất phải có revoked_at trong DB');
            assert(secondRow && secondRow.revoked_at === null, 'phiên còn dùng phải giữ revoked_at = null');
        }

        // ---- 9. Phiên hết hạn ----
        {
            const expiring = await login({ login: accountLogin, password: PASSWORD });
            const expiringToken = verifyAthleteSession(expiring.cookieValue, SECRET);
            const { error } = await db.from('athlete_account_sessions')
                .update({
                    issued_at: new Date(Date.now() - 2 * 60_000).toISOString(),
                    expires_at: new Date(Date.now() - 60_000).toISOString(),
                })
                .eq('session_key_hash', hashAthleteSessionKey(expiringToken.session_key));
            if (error) throw error;
            await expectIdentityError(resolveSession(expiringToken), 'ATHLETE_SESSION_EXPIRED', 'phiên hết hạn trong DB');
            await expectIdentityError(getProfile(expiringToken), 'ATHLETE_SESSION_EXPIRED', 'hồ sơ với phiên hết hạn');
        }

        console.log(`athlete-login live: all ${checks} checks passed`);
    } finally {
        await cleanup('sau khi chạy');
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
