'use strict';

const { hashPassword } = require('../../domain/identity/password');
const {
  validateAthleteAccountRegistration,
  validateMembershipClaimable,
  validateAthleteClaimable,
} = require('../../domain/identity/athleteAccount');
const { authorizeClubSession } = require('./authorization');
const { identityError } = require('./errors');

const INPUT_REASONS = Object.freeze({
  login_required: 'Tên đăng nhập là bắt buộc',
  login_format_invalid: 'Tên đăng nhập chỉ gồm 3-30 ký tự thường, số, dấu chấm, gạch ngang hoặc gạch dưới',
  password_too_short: 'Mật khẩu cần tối thiểu 8 ký tự',
  password_too_long: 'Mật khẩu quá dài',
  display_name_required: 'Họ tên là bắt buộc',
  membership_id_invalid: 'Cần chọn đúng hồ sơ VĐV',
});

const LOGIN_TAKEN_MESSAGE = 'Tên đăng nhập đã tồn tại';
const ATHLETE_TAKEN_MESSAGE = 'Hồ sơ VĐV này đã được liên kết với tài khoản khác';

// Hai request song song có thể cùng vượt qua bước kiểm tra đọc ở trên, nên
// unique index (lower(login), athlete_id) ở DB là chốt cuối. Postgres trả
// 23505; map sang 409 kèm thông báo tiếng Việt thay vì để rơi vào lỗi 500.
function isUniqueViolation(error) {
  return error?.code === '23505';
}

function uniqueViolationMessage(error) {
  const target = `${error?.constraint || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();
  if (target.includes('login')) return LOGIN_TAKEN_MESSAGE;
  if (target.includes('athlete_id')) return ATHLETE_TAKEN_MESSAGE;
  return 'Hồ sơ hoặc tên đăng nhập đã được sử dụng';
}


function createListClaimableAthletes({ repository, now = Date.now }) {
  return async function listClaimableAthletes(input = {}) {
    const club = await authorizeClubSession({
      repository,
      session: input.session,
      action: 'read',
      groupId: input.session?.group_id,
      now: now(),
    });
    return repository.findClaimableMemberships(club.id);
  };
}

function createRegisterAthleteAccount({ repository, now = Date.now }) {
  return async function registerAthleteAccount(input = {}) {
    const club = await authorizeClubSession({
      repository,
      session: input.session,
      action: 'read',
      groupId: input.session?.group_id,
      now: now(),
    });

    const parsed = validateAthleteAccountRegistration(input);
    if (!parsed.valid) {
      throw identityError('INVALID_INPUT', INPUT_REASONS[parsed.reason] || parsed.reason);
    }

    const found = await repository.findMembershipWithAthlete(parsed.membershipId, club.id);
    const membershipCheck = validateMembershipClaimable(found?.membership, { clubId: club.id });
    if (!membershipCheck.valid) {
      throw identityError('NOT_FOUND', 'Hồ sơ VĐV không tồn tại hoặc không còn sinh hoạt trong CLB');
    }
    const athleteCheck = validateAthleteClaimable(found.athlete);
    if (!athleteCheck.valid) {
      throw identityError('VERSION_CONFLICT', ATHLETE_TAKEN_MESSAGE);
    }

    const [loginTaken, athleteTaken] = await Promise.all([
      repository.findAthleteAccountByLogin(parsed.login),
      repository.findAthleteAccountByAthleteId(found.athlete.id),
    ]);
    if (loginTaken) throw identityError('VERSION_CONFLICT', LOGIN_TAKEN_MESSAGE);
    if (athleteTaken) throw identityError('VERSION_CONFLICT', ATHLETE_TAKEN_MESSAGE);

    try {
      return await repository.createAthleteAccount({
        login: parsed.login,
        passwordHash: hashPassword(parsed.password),
        displayName: parsed.displayName,
        athleteId: found.athlete.id,
        clubId: club.id,
        membershipId: found.membership.id,
        correlationId: input.correlationId || null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw identityError('VERSION_CONFLICT', uniqueViolationMessage(error));
      }
      throw error;
    }
  };
}

module.exports = {
  INPUT_REASONS,
  createListClaimableAthletes,
  createRegisterAthleteAccount,
};
