'use strict';

// Hạn mức tần suất cho luồng danh tính công khai (Epic 4, D60). Thuần: chỉ bảng chính sách + hàm dựng khóa bucket.
// Bộ đếm thật nằm ở DB (RPC consume_rate_limit, migration 112) vì bộ nhớ tiến trình không bền trên serverless.

const RATE_POLICIES = Object.freeze({
  register_ip: Object.freeze({ limit: 5, windowSeconds: 3600 }),
  register_phone: Object.freeze({ limit: 3, windowSeconds: 3600 }),
  login: Object.freeze({ limit: 8, windowSeconds: 300 }),
  session_read_ip: Object.freeze({ limit: 30, windowSeconds: 60 }),
  profile: Object.freeze({ limit: 20, windowSeconds: 60 }),
  platform_login: Object.freeze({ limit: 8, windowSeconds: 300 }),
  // Lát C2: theo tài khoản VĐV.
  community_register: Object.freeze({ limit: 10, windowSeconds: 3600 }),
  community_invite: Object.freeze({ limit: 3, windowSeconds: 3600 }),
  community_join: Object.freeze({ limit: 20, windowSeconds: 3600 }),
});

const BUCKET_MAX = 300;
const PART_MAX = 100;

function policyFor(key) {
  const policy = RATE_POLICIES[key];
  if (!policy) throw new Error(`Unknown rate policy: ${key}`);
  return policy;
}

function part(value) {
  const text = String(value == null || value === '' ? 'unknown' : value).trim().toLowerCase();
  return (text || 'unknown').slice(0, PART_MAX);
}

// Khóa bucket ổn định: player:<chính sách>:<phần…>. Login dùng (SĐT + IP) để một người thử sai không khóa cả IP chung.
function bucketFor(key, { phoneNorm, ip, login, accountId } = {}) {
  policyFor(key);
  const parts = {
    register_ip: [ip],
    register_phone: [phoneNorm],
    login: [phoneNorm, ip],
    session_read_ip: [ip],
    profile: [accountId],
    platform_login: [login, ip],
    community_register: [accountId],
    community_invite: [accountId],
    community_join: [accountId],
  }[key];
  return ['player', key, ...parts.map(part)].join(':').slice(0, BUCKET_MAX);
}

module.exports = { RATE_POLICIES, policyFor, bucketFor };
