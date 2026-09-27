'use client';

import Link from 'next/link';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { STATUS_TONE } from '../v2/setup-v3/friendly/friendlyUi';
import './loi-moi.css';

// Font đúng thiết kế Stitch (Plus Jakarta Sans), tự host lúc build như shell setup.
export const liFont = Plus_Jakarta_Sans({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700', '800'], variable: '--li-font', display: 'swap' });

export function LiPage({ children, label }) {
  return <main className={`li-page ${liFont.variable}`} aria-label={label}>{children}</main>;
}

// Nhãn trạng thái luôn lấy từ statusLabel của API (không tự dịch mã).
export function LiStatus({ status, label }) {
  if (!label) return null;
  return <span className="li-status" data-tone={STATUS_TONE[status] || 'wait'}>{label}</span>;
}

export function LiTopbar({ title, backHref = '/giai-dau/loi-moi', onBack }) {
  return (
    <div className="li-topbar">
      {onBack
        ? <button type="button" className="li-icon-btn" aria-label="Quay lại" onClick={onBack}>‹</button>
        : <Link className="li-icon-btn" href={backHref} aria-label="Quay lại">‹</Link>}
      <h1>{title}</h1>
      <span style={{ width: 44 }} aria-hidden="true" />
    </div>
  );
}
