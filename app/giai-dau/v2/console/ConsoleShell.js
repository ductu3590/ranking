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

export function resolveStepKey(stepParam, tabParam) {
  if (stepParam && STEPS.some((step) => step.key === stepParam)) return stepParam;
  return LEGACY_TAB_TO_STEP[tabParam] || 'control';
}

function StepButton({ step, active, done, onClick }) {
  return <button type="button" className={`ops-step ${done ? 'is-done' : ''}`} aria-current={active ? 'true' : 'false'} onClick={() => onClick(step.key)}>
    <span className="ops-step-n">{done ? '✓' : step.n}</span><span>{step.label}</span>
  </button>;
}

export default function ConsoleShell({ tournament, progress, readiness, children }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeKey = resolveStepKey(searchParams.get('step'), searchParams.get('tab'));
  const prepDone = useMemo(() => STEPS.filter((step) => step.phase === 'prep' && readiness?.[step.key]).length, [readiness]);
  function go(key) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', key); params.delete('tab');
    router.push(`?${params.toString()}`); setDrawerOpen(false);
  }
  const control = STEPS.find((step) => step.key === 'control');
  return <div className={`ops-shell ${drawerOpen ? 'is-drawer-open' : ''}`}>
    <aside className="ops-side">
      <div className="ops-brand"><div className="ops-brand-mark">PH</div><div><b>{tournament?.name || 'Giải đấu'}</b><span>Bàn điều hành</span></div></div>
      <div className="ops-phase"><span>Chuẩn bị</span><span className="ops-phase-count">{prepDone}/4 xong</span></div>
      {STEPS.filter((step) => step.phase === 'prep').map((step) => <StepButton key={step.key} step={step} active={activeKey === step.key} done={readiness?.[step.key] === true} onClick={go} />)}
      <div className="ops-live-wrap"><div className="ops-live-box"><div className="ops-live-head"><span className="ops-step-n">{control.n}</span><b>{control.label}</b></div><div className="ops-live-meta">{tournament?.status === 'live' ? <span className="ops-live-dot"><i />LIVE</span> : null}<span>{progress ? `${progress.finalized}/${progress.total} trận` : 'Chưa có dữ liệu'}</span></div><button type="button" onClick={() => go('control')}>Vào điều hành</button></div></div>
      <div className="ops-phase"><span>Trong &amp; sau giải</span></div>
      {STEPS.filter((step) => step.phase === 'after').map((step) => <StepButton key={step.key} step={step} active={activeKey === step.key} done={false} onClick={go} />)}
    </aside>
    <div className="ops-main"><div className="ops-topbar"><button type="button" className="ops-burger" aria-label="Mở menu" onClick={() => setDrawerOpen((open) => !open)}>☰</button><span className="ops-topbar-title">{STEPS.find((step) => step.key === activeKey)?.label}</span></div><div className="ops-scroll">{children(activeKey)}</div></div>
  </div>;
}