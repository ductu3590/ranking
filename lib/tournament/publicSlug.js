'use strict';
// Slug công khai của giải (link xem). Tách nguyên văn khỏi app/api/tournament-v2/tournaments/route.js để finalize
// giải giao hữu (D50: chốt giải đang riêng tư → tự bật "chỉ ai có link") dùng chung — KHÔNG đổi thuật toán:
// tên bỏ dấu tiếng Việt → chữ thường a-z0-9 nối bằng '-', thêm hậu tố ngẫu nhiên 18 ký tự hex (72 bit).

const { randomBytes } = require('crypto');

function slugify(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateSlug(name) {
  const base = slugify(name) || 'giai';
  const suffix = randomBytes(9).toString('hex');
  return `${base}-${suffix}`;
}

module.exports = { slugify, generateSlug };
