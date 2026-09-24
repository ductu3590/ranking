'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { STATUS_LABELS } from '@/lib/tournament/lifecycle';
import { requestLeave } from './leaveGuard';
import './shell.css';

// Bàn điều hành sau khi chốt giải còn 4 mục (ADR-007 D29, spec Epic 2 Lát E1 §2). Việc chuẩn bị
// (thông tin, người tham gia, thể thức, bốc thăm) nằm ở workspace setup 4 bước, không lặp lại ở đây.
export const STEPS = [
  { key: 'control', label: 'Điều hành', short: 'Điều hành', icon: 'control' },
  { key: 'matches', label: 'Trận đấu', short: 'Trận đấu', icon: 'matches' },
  { key: 'bracket', label: 'Sơ đồ & xếp hạng', short: 'Sơ đồ', icon: 'bracket' },
  { key: 'settings', label: 'Cài đặt', short: 'Cài đặt', icon: 'settings' },
];

// Link cũ không vỡ: mọi khóa step/tab của console 8 bước trước đây đều có đích.
export const LEGACY_STEP_TO_STEP = {
  control: 'control', courts: 'control', schedule: 'matches', standings: 'bracket',
  config: 'settings', log: 'settings', draw: 'settings', athletes: 'settings',
};
export const LEGACY_TAB_TO_STEP = {
  overview: 'control', results: 'matches', standings: 'bracket', bracket: 'bracket',
  teams: 'settings', openreg: 'settings', settings: 'settings',
};

export function resolveStepKey(stepParam, tabParam, defaultStep = 'control') {
  if (stepParam && STEPS.some((step) => step.key === stepParam)) return stepParam;
  if (stepParam && LEGACY_STEP_TO_STEP[stepParam]) return LEGACY_STEP_TO_STEP[stepParam];
  return LEGACY_TAB_TO_STEP[tabParam] || defaultStep;
}

const ICONS = {
  control: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  matches: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  bracket: <path d="M4 5h5v4H4zM4 15h5v4H4zM15 10h5v4h-5zM9 7h3v10H9M12 12h3" />,
  settings: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm8 3-2-.6a6 6 0 0 0-.7-1.6l1-1.8-1.3-1.3-1.8 1a6 6 0 0 0-1.6-.7L13 4h-2l-.6 2a6 6 0 0 0-1.6.7l-1.8-1-1.3 1.3 1 1.8a6 6 0 0 0-.7 1.6L4 11v2l2 .6c.2.6.4 1.1.7 1.6l-1 1.8 1.3 1.3 1.8-1c.5.3 1 .5 1.6.7L11 20h2l.6-2c.6-.2 1.1-.4 1.6-.7l1.8 1 1.3-1.3-1-1.8c.3-.5.5-1 .7-1.6L20 13z" />,
};

function NavIcon({ name }) {
  return <svg className="v2-console-nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>;
}

export default function ConsoleShell({ tournament, progress, actor, children, defaultStep = 'control', backHref = '/giai-dau/v2' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeKey = resolveStepKey(searchParams.get('step'), searchParams.get('tab'), defaultStep);
  const active = STEPS.find((step) => step.key === activeKey) || STEPS[0];

  function go(key) {
    if (key === activeKey) return;
    requestLeave(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', key);
      params.delete('tab');
      router.push(`?${params.toString()}`);
    });
  }

  const statusLabel = STATUS_LABELS[tournament?.status] || null;
  const percent = progress && progress.total ? Math.round((progress.finalized / progress.total) * 100) : 0;

  return <div className="v2-console-shell">
    <header className="v2-console-topbar">
      <Link className="v2-console-back" href={backHref}>← Danh sách giải</Link>
      <span className="v2-console-topbar-title">{tournament?.name || 'Giải đấu'}</span>
      {statusLabel ? <span className={`v2-console-status is-${tournament?.status}`}><i aria-hidden="true" />{statusLabel}</span> : null}
      <span className="v2-console-topbar-page">{active.label}</span>
    </header>
    <div className="v2-console-body">
      <aside className="v2-console-side" aria-label="Bàn điều hành">
        <div className="v2-console-brand">
          <b>{tournament?.name || 'Giải đấu'}</b>
          {statusLabel ? <span className={`v2-console-status is-${tournament?.status}`}><i aria-hidden="true" />{statusLabel}</span> : null}
        </div>
        <nav className="v2-console-nav">
          {STEPS.map((step) => <button key={step.key} type="button" className="v2-console-step" aria-current={activeKey === step.key ? 'page' : undefined} onClick={() => go(step.key)}>
            <NavIcon name={step.icon} /><span>{step.label}</span>
          </button>)}
        </nav>
        <div className="v2-console-progress-card">
          <div><span>Tiến độ giải</span><b>{progress ? `${progress.finalized}/${progress.total} trận` : '—'}</b></div>
          <div className="v2-console-progress-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
        </div>
        <div className="v2-console-admin-card">
          <span className="v2-console-admin-avatar" aria-hidden="true">{String(actor?.group_code || 'PH').slice(0, 2)}</span>
          <span className="v2-console-admin-copy">
            <b>{actor?.group_name || 'PickHub'}</b>
            <small>{actor?.role === 'admin' ? 'Quản trị viên' : 'Thành viên (chỉ xem)'}</small>
          </span>
        </div>
      </aside>
      <main className="v2-console-main">{children(activeKey)}</main>
    </div>
    <nav className="v2-console-tabbar" aria-label="Bàn điều hành">
      {STEPS.map((step) => <button key={step.key} type="button" aria-current={activeKey === step.key ? 'page' : undefined} onClick={() => go(step.key)}>
        <NavIcon name={step.icon} /><span>{step.short}</span>
      </button>)}
    </nav>
  </div>;
}
