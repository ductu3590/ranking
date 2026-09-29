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

export function Notice({ tone = 'info', icon = false, children }) {
    return (
        <p className="cd-note" data-tone={tone} data-icon={icon || undefined} role={tone === 'error' ? 'alert' : 'status'}>
            {icon ? <Svg size={18}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></Svg> : null}
            <span>{children}</span>
        </p>
    );
}

export function PinIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
        </svg>
    );
}

function Svg({ children, size = 16, sw = 2 }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    );
}

export function UserIcon() { return <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></Svg>; }
export function BoxIcon() { return <Svg><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5h8v2M3 12h18" /></Svg>; }
export function UsersIcon() { return <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2.2.6 3.5 2.3 3.5 5" /></Svg>; }
export function LinkIcon() { return <Svg size={20}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>; }
export function PhoneIcon() { return <Svg size={20}><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></Svg>; }
export function BellIcon() { return <Svg size={20}><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></Svg>; }
export function CopyIcon() { return <Svg><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Svg>; }
export function SendIcon() { return <Svg><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" /></Svg>; }
export function CheckIcon() { return <Svg sw={2.5}><path d="m5 12 5 5 9-10" /></Svg>; }
export function XIcon() { return <Svg sw={2.5}><path d="M6 6l12 12M18 6 6 18" /></Svg>; }
export function UsersPlusIcon() { return <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M19 8v6M16 11h6" /></Svg>; }
export function CardIcon() { return <Svg><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></Svg>; }
export function ClockIcon() { return <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>; }
export function ArrowIcon() { return <Svg sw={2.25}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>; }
export function ChevronDownIcon() { return <Svg><path d="m6 9 6 6 6-6" /></Svg>; }

export function SearchIcon() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
    );
}

export function ChevronIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
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
