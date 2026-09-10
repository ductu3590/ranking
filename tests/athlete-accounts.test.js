'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { IdentityServiceError } = require('../lib/application/identity/errors');
const {
  validateAthleteAccountRegistration,
  validateMembershipClaimable,
  validateAthleteClaimable,
} = require('../lib/domain/identity/athleteAccount');
const {
  createListClaimableAthletes,
  createRegisterAthleteAccount,
} = require('../lib/application/identity/athleteAccounts');
const { verifyPassword } = require('../lib/domain/identity/password');

const now = 1_800_000_000_000;
const memberSession = {
  group_id: 7,
  group_code: 'PICKHUB7',
  role: 'member',
  issued_at: now - 1_000,
  expires_at: now + 60_000,
  session_version: 1,
  access_version: 3,
  session_key: 'active-member-key',
};

function baseRepository(overrides = {}) {
  return {
    async findClubById(id) {
      return id === 7 ? { id: 7, code: 'PICKHUB7', name: 'PickHub 7', access_version: 3 } : null;
    },
    async isSessionActive() { return true; },
    async findMembershipWithAthlete(membershipId, clubId) {
      if (membershipId !== 11 || clubId !== 7) return null;
      return {
        membership: { id: 11, club_id: 7, athlete_id: 21, status: 'active', club_alias: 'Tuấn' },
        athlete: { id: 21, display_name: 'Nguyễn Văn Tuấn', status: 'unclaimed' },
      };
    },
    async findAthleteAccountByLogin() { return null; },
    async findAthleteAccountByAthleteId() { return null; },
    async createAthleteAccount(input) {
      return { id: 1, login: input.login, displayName: input.displayName, athleteId: input.athleteId, clubId: input.clubId, membershipId: input.membershipId, status: 'active' };
    },
    ...overrides,
  };
}

function expectCode(code) {
  return (error) => error instanceof IdentityServiceError && error.code === code;
}

function testDomainValidation() {
  assert.equal(validateAthleteAccountRegistration({ login: 'A B', password: 'longenough', displayName: 'X', membershipId: 1 }).reason, 'login_format_invalid');
  assert.equal(validateAthleteAccountRegistration({ login: 'tuan.nguyen', password: 'short', displayName: 'X', membershipId: 1 }).reason, 'password_too_short');
  assert.equal(validateAthleteAccountRegistration({ login: 'tuan.nguyen', password: 'longenough', displayName: '  ', membershipId: 1 }).reason, 'display_name_required');
  assert.equal(validateAthleteAccountRegistration({ login: 'tuan.nguyen', password: 'longenough', displayName: 'X', membershipId: 0 }).reason, 'membership_id_invalid');

  const ok = validateAthleteAccountRegistration({ login: '  Tuan.Nguyen ', password: 'longenough', displayName: '  Nguyễn   Văn Tuấn ', membershipId: '11' });
  assert.equal(ok.valid, true);
  assert.equal(ok.login, 'tuan.nguyen');
  assert.equal(ok.displayName, 'Nguyễn Văn Tuấn');
  assert.equal(ok.membershipId, 11);

  assert.equal(validateMembershipClaimable(null).reason, 'membership_not_found');
  assert.equal(validateMembershipClaimable({ club_id: 9, status: 'active' }, { clubId: 7 }).reason, 'membership_club_mismatch');
  assert.equal(validateMembershipClaimable({ club_id: 7, status: 'ended' }, { clubId: 7 }).reason, 'membership_not_active');
  assert.equal(validateAthleteClaimable({ status: 'linked' }).reason, 'athlete_already_linked');
  assert.equal(validateAthleteClaimable({ status: 'unclaimed' }).valid, true);
}

async function testRegisterHappyPath() {
  let written = null;
  const register = createRegisterAthleteAccount({
    repository: baseRepository({
      async createAthleteAccount(input) {
        written = input;
        return { id: 5, login: input.login, displayName: input.displayName, athleteId: input.athleteId, clubId: input.clubId, membershipId: input.membershipId, status: 'active' };
      },
    }),
    now: () => now,
  });

  const account = await register({ session: memberSession, login: 'Tuan.Nguyen', password: 'matkhau123', displayName: 'Nguyễn Văn Tuấn', membershipId: 11 });
  assert.equal(account.login, 'tuan.nguyen');
  assert.equal(account.athleteId, 21);
  assert.equal(account.clubId, 7);
  assert.equal(account.membershipId, 11);
  assert.equal(written.passwordHash.startsWith('pbkdf2:'), true);
  assert.equal(verifyPassword('matkhau123', written.passwordHash), true);
  assert.equal(verifyPassword('sai-mat-khau', written.passwordHash), false);
}

async function testRegisterRejectsCrossClubMembership() {
  const register = createRegisterAthleteAccount({ repository: baseRepository(), now: () => now });
  await assert.rejects(
    register({ session: { ...memberSession, group_id: 7 }, login: 'tuan.nguyen', password: 'matkhau123', displayName: 'Tuấn', membershipId: 99 }),
    expectCode('NOT_FOUND'),
  );
}

async function testRegisterRejectsClaimedAthlete() {
  const register = createRegisterAthleteAccount({
    repository: baseRepository({
      async findMembershipWithAthlete() {
        return {
          membership: { id: 11, club_id: 7, athlete_id: 21, status: 'active' },
          athlete: { id: 21, display_name: 'Nguyễn Văn Tuấn', status: 'linked' },
        };
      },
    }),
    now: () => now,
  });
  await assert.rejects(
    register({ session: memberSession, login: 'tuan.nguyen', password: 'matkhau123', displayName: 'Tuấn', membershipId: 11 }),
    expectCode('VERSION_CONFLICT'),
  );
}

async function testRegisterRejectsDuplicateLogin() {
  const register = createRegisterAthleteAccount({
    repository: baseRepository({
      async findAthleteAccountByLogin() { return { id: 3, login: 'tuan.nguyen', status: 'active' }; },
    }),
    now: () => now,
  });
  await assert.rejects(
    register({ session: memberSession, login: 'tuan.nguyen', password: 'matkhau123', displayName: 'Tuấn', membershipId: 11 }),
    expectCode('VERSION_CONFLICT'),
  );
}

async function testRegisterRequiresClubSession() {
  const register = createRegisterAthleteAccount({ repository: baseRepository(), now: () => now });
  await assert.rejects(
    register({ session: null, login: 'tuan.nguyen', password: 'matkhau123', displayName: 'Tuấn', membershipId: 11 }),
    expectCode('SESSION_UNAUTHORIZED'),
  );
}

async function testListClaimableIsClubScoped() {
  let receivedClubId = null;
  const list = createListClaimableAthletes({
    repository: baseRepository({
      async findClaimableMemberships(clubId) {
        receivedClubId = clubId;
        return [{ membershipId: 11, athleteId: 21, alias: 'Tuấn', displayName: 'Nguyễn Văn Tuấn', athleteStatus: 'unclaimed' }];
      },
    }),
    now: () => now,
  });
  const candidates = await list({ session: memberSession });
  assert.equal(receivedClubId, 7);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].membershipId, 11);
}

function testRouteContract() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'identity', 'athlete-accounts', 'route.js'), 'utf8');
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
  assert.match(source, /enforceIdentityMutationRateLimit/);
  assert.match(source, /identityRouteError/);
  assert.doesNotMatch(source, /password_hash/);
}

function testPageContract() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'dang-ky', 'page.js'), 'utf8');
  assert.match(source, /'use client'/);
  assert.match(source, /\/api\/identity\/athlete-accounts/);
  assert.match(source, /type="password"/);
  assert.doesNotMatch(source, /from '@\/lib\/supabase/);

  const cta = fs.readFileSync(path.join(__dirname, '..', 'components', 'pickhub', 'MemberProfileView.js'), 'utf8');
  assert.match(cta, /\/dang-ky\?membershipId=/);
  assert.doesNotMatch(cta, /Chưa hoạt động/);
}

function testMigrationContract() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '048_athlete_accounts.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.athlete_accounts/);
  assert.match(sql, /athlete_id bigint NOT NULL UNIQUE/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE/);
}

async function main() {
  testDomainValidation();
  await testRegisterHappyPath();
  await testRegisterRejectsCrossClubMembership();
  await testRegisterRejectsClaimedAthlete();
  await testRegisterRejectsDuplicateLogin();
  await testRegisterRequiresClubSession();
  await testListClaimableIsClubScoped();
  testRouteContract();
  testPageContract();
  testMigrationContract();
  console.log('athlete-accounts: all checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
