'use strict';

function normalizeClubCode(value) {
  if (value === null || value === undefined) return '';
  return String(value).normalize('NFKC').trim().toUpperCase();
}

module.exports = { normalizeClubCode };
