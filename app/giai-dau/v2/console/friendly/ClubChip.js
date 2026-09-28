'use client';

import './friendly-standings.css';

// Chip CLB dùng chung cho giải giao hữu (spec Epic 3 F3 §5): chấm màu + tên rút gọn ≤ 14 ký tự, tên đầy đủ ở title.
// Màu luôn lấy từ dữ liệu server (friendlyStandings.CLUB_COLORS qua `color`); không tự sinh màu.
export const CLUB_CHIP_MAX = 14;

export function shortClubName(name, max = CLUB_CHIP_MAX) {
  const text = String(name || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export default function ClubChip({ name, color, full = false, className = '' }) {
  if (!name) return null;
  const label = full ? String(name) : shortClubName(name);
  return (
    <span className={`fr-club-chip${className ? ` ${className}` : ''}`} title={String(name)} style={color ? { '--fr-club': color } : undefined}>
      <i aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
