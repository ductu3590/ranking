'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import './shell.css';

export const STEPS = [
  { key: 'config', n: 1, phase: 'prep', label: 'Cấu hình giải & số ván' },
  { key: 'courts', n: 2, phase: 'prep', label: 'Sân & sơ đồ sân đấu' },
  { key: 'athletes', n: 3, phase: 'prep', label: 'VĐV & cặp đấu' },
  { key: 'draw', n: 4, phase: 'prep', label: 'Bốc thăm & chốt lịch' },
  { key: 'control', n: 5, phase: 'live', label: 'Trung tâm điều hành' },
  { key: 'schedule', n: 6, phase: 'after', label: 'Lịch thi đấu & kết quả' },
  { key: 'standings', n: 7, phase: 'after', label: 'Bảng đấu & xếp hạng' },
  { key: 'log', n: 8, phase: 'after', label: 'Nhật ký thao tác' },
];

export const LEGACY_TAB_TO_STEP = { overview: 'control', results: 'schedule', standings: 'standings', bracket: 'standings', teams: 'athletes', openreg: 'athletes', settings: 'config' };

export function resolveStepKey(stepParam, tabParam, defaultStep = 'control') {
  if (stepParam && STEPS.some((step) => step.key === stepParam)) return stepParam;
  return LEGACY_TAB_TO_STEP[tabParam] || defaultStep;
}

function StepButton({ step, active, done, onClick }) {
  return <button type="button" className={`v2-console-step ${done ? 'is-done' : ''}`} aria-current={active ? 'true' : 'false'} onClick={() => onClick(step.key)}>
    <span className="v2-console-step-n">{done ? '✓' : step.n}</span><span>{step.label}</span>
  </button>;
}

export default function ConsoleShell({ tournament, progress, readiness, actor, children, defaultStep = 'control' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeKey = resolveStepKey(searchParams.get('step'), searchParams.get('tab'), defaultStep);
  const prepDone = useMemo(() => STEPS.filter((step) => step.phase === 'prep' && readiness?.[step.key]).length, [readiness]);
  function go(key) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', key); params.delete('tab');
    router.push(`?${params.toString()}`); setDrawerOpen(false);
  }
  const control = STEPS.find((step) => step.key === 'control');
  return <div className={`v2-console-shell ${drawerOpen ? 'is-drawer-open' : ''}`}>
    <aside className="v2-console-side">
      <div className="v2-console-brand"><div className="v2-console-brand-mark">PH</div><div><b>{tournament?.name || 'Giải đấu'}</b><span>Bàn điều hành</span></div></div>
      <div className="v2-console-phase"><span>Chuẩn bị</span><span className="v2-console-phase-count">{prepDone}/4 xong</span></div>
      {STEPS.filter((step) => step.phase === 'prep').map((step) => <StepButton key={step.key} step={step} active={activeKey === step.key} done={readiness?.[step.key] === true} onClick={go} />)}
      <div className="v2-console-live-wrap"><div className="v2-console-live-box"><div className="v2-console-live-head"><span className="v2-console-step-n">{control.n}</span><b>{control.label}</b></div><div className="v2-console-live-meta">{tournament?.status === 'live' ? <span className="v2-console-live-dot"><i />LIVE</span> : null}<span>{progress ? `${progress.finalized}/${progress.total} trận` : 'Chưa có dữ liệu'}</span></div><button type="button" disabled={!readiness?.draw} onClick={() => go(readiness?.draw ? 'control' : defaultStep)}>{readiness?.draw ? 'Vào điều hành' : 'Hoàn tất thiết lập trước'}</button></div></div>
      <div className="v2-console-phase"><span>Trong &amp; sau giải</span></div>
      {STEPS.filter((step) => step.phase === 'after').map((step) => <StepButton key={step.key} step={step} active={activeKey === step.key} done={false} onClick={go} />)}
      <div className="v2-console-admin-card">
        <span className="v2-console-admin-avatar" aria-hidden="true">{String(actor?.group_code || 'PH').slice(0, 2)}</span>
        <span className="v2-console-admin-copy">
          <b>{actor?.group_name || 'PickHub'}</b>
          <small>{actor?.role === 'admin' ? 'Quản trị viên (Admin)' : 'Đang xác thực quyền...'}</small>
        </span>
        <i aria-label="Đang hoạt động" />
      </div>
    </aside>
    <div className="v2-console-main"><div className="v2-console-topbar"><button type="button" className="v2-console-burger" aria-label="Mở menu" onClick={() => setDrawerOpen((open) => !open)}>☰</button><span className="v2-console-topbar-title">{STEPS.find((step) => step.key === activeKey)?.label}</span></div><div className="v2-console-scroll">{children(activeKey)}</div></div>
  </div>;
}
