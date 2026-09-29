'use strict';
// Ánh xạ lỗi RPC của lát C2 sang mã ổn định + HTTP status (Epic 4 C2, spec §6). Thuần.
// Các RPC ném RAISE EXCEPTION '<MÃ>' USING ERRCODE = 'PH409' (như 078/111): server phân biệt theo message.

const { COMMUNITY_ERRORS } = require('./communityRegistration');

const STATUS_BY_CODE = Object.freeze({
  PLAYER_SESSION_REQUIRED: 401,
  COMMUNITY_NOT_FOUND: 404,
  COMMUNITY_LINK_INVALID: 404,
  COMMUNITY_GENDER_REQUIRED: 400,
  COMMUNITY_DOB_REQUIRED: 400,
  COMMUNITY_PHR_REQUIRED: 400,
  COMMUNITY_PARTNER_PHONE_INVALID: 400,
  COMMUNITY_PARTNER_MODE_REQUIRED: 400,
  COMMUNITY_INVITE_SELF: 400,
  COMMUNITY_FEE_NOT_APPLICABLE: 400,
});

const KNOWN_CODES = Object.freeze([...COMMUNITY_ERRORS, 'PLAYER_SESSION_REQUIRED']);

// error: lỗi từ supabase-js (`{ message, code }`). Trả { code, status } hoặc null khi không phải lỗi nghiệp vụ.
function parseRpcError(error) {
  const message = String(error?.message ?? '');
  const code = KNOWN_CODES.find((known) => message.includes(known));
  if (!code) return null;
  return { code, status: STATUS_BY_CODE[code] || 409 };
}

module.exports = { STATUS_BY_CODE, KNOWN_CODES, parseRpcError };
