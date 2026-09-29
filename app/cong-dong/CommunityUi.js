'use client';

import { initialOf } from './communityClient';

// Thành phần giao diện nhỏ dùng chung (badge trạng thái, chip phí, thanh tiến độ, avatar). Không có logic nghiệp vụ:
// nhãn/tông màu do domain (communityRegistration.js) quyết định và truyền vào.

export function StatusBadge({ tone = 'neutral', children }) {
    return <span className="cd-badge" data-tone={tone}>{children}</span>;
}

export function FeeChip({ fee }) {
    if (!fee) return null;
    return <span className="cd-chip" data-tone={fee.tone}>{fee.label}</span>;
}

export function Chip({ children, tone }) {
    return <span className="cd-chip" data-tone={tone}>{children}</span>;
}

export function ProgressBar({ value, max, label }) {
    const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
        <div className="cd-progress">
            <div className="cd-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={max || 0} aria-valuenow={value} aria-label={label}>
                <span style={{ width: `${percent}%` }} />
            </div>
            <span className="cd-progress__text">{label}</span>
        </div>
    );
}

export function Avatar({ name }) {
    return <span className="cd-avatar" aria-hidden="true">{initialOf(name)}</span>;
}

export function Notice({ tone = 'info', children }) {
    return <p className="cd-note" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>;
}

export function PinIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
        </svg>
    );
}

export function CalendarIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
    );
}
