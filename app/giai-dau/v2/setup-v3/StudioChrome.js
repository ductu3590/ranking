'use client';

import { useEffect, useRef } from 'react';
import { messageFor } from '@/lib/tournament/setupMessages';

export const STUDIO_STEPS = [
  { id: 1, title: 'Thông tin giải' },
  { id: 2, title: 'Người tham gia' },
  { id: 3, title: 'Ghép cặp, thể thức & sân' },
  { id: 4, title: 'Bốc thăm & chốt' },
];

function timeLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// Trạng thái lưu trung thực (spec Lát 0 §4.2). Không bao giờ nói "tự động".
export function saveStatusText(save) {
  switch (save.status) {
    case 'saving': return 'Đang lưu…';
    case 'saved': return save.lastSavedAt ? `Đã lưu lúc ${timeLabel(save.lastSavedAt)}` : 'Đã lưu';
    case 'dirty': return 'Có thay đổi chưa lưu';
    case 'error': return 'Lưu thất bại';
    case 'conflict': return 'Bản nháp vừa được sửa ở nơi khác';
    default: return 'Chưa lưu';
  }
}

export function StudioHeader({ title, save, onBack }) {
  return (
    <header className="pc-header">
      <button type="button" className="pc-header__back" onClick={onBack} aria-label="Quay về danh sách giải">‹</button>
      <div className="pc-header__title">
        <h1>{title || 'Tạo giải nội bộ'}</h1>
        <span className="pc-badge pc-badge--draft">Nháp</span>
        <span className="pc-save-status" data-status={save.status} role="status" aria-live="polite">{saveStatusText(save)}</span>
      </div>
    </header>
  );
}

export function StudioStepper({ step, completedThrough, summaries, onSelect }) {
  const currentRef = useRef(null);
  useEffect(() => { currentRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }, [step]);
  return (
    <nav className="pc-stepper" aria-label="Các bước tạo giải">
      <ol>
        {STUDIO_STEPS.map((item) => {
          const done = item.id <= completedThrough;
          const open = item.id <= completedThrough + 1;
          const current = item.id === step;
          return (
            <li key={item.id}>
              <button
                ref={current ? currentRef : undefined}
                type="button" className="pc-step" disabled={!open}
                aria-label={`Bước ${item.id}: ${item.title}${done && !current ? ' (đã xong)' : ''}${!open ? ' (chưa mở)' : ''}`}
                aria-current={current ? 'step' : undefined} data-done={done && !current ? 'true' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <span className="pc-step__num" aria-hidden="true">{done && !current ? '✓' : item.id}</span>
                <span className="pc-step__label">
                  <span className="pc-step__eyebrow">Bước {item.id}{!open ? ' · chưa mở' : ''}</span>
                  <span className="pc-step__title">{item.title}</span>
                  {done && summaries[item.id] ? <span className="pc-step__meta">{summaries[item.id]}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ReadinessRail({ step, readiness, nextHint }) {
  const result = readiness.byStep[step];
  const items = [
    ...result.blockers.map((item) => ({ ...item, state: 'blocker' })),
    ...result.warnings.map((item) => ({ ...item, state: 'warning' })),
  ];
  return (
    <aside className="pc-rail" aria-label="Kiểm tra sẵn sàng">
      <section className="pc-card">
        <div className="pc-rail__summary" style={{ marginBottom: '0.75rem' }}>
          <h2 className="pc-card__title">Kiểm tra sẵn sàng</h2>
          {result.blockers.length
            ? <span className="pc-badge pc-badge--draft">{result.blockers.length} cần sửa</span>
            : <span className="pc-badge pc-badge--ok">Đạt</span>}
        </div>
        {items.length ? (
          <ul className="pc-checklist">
            {items.map((item, index) => (
              <li key={`${item.code}-${index}`} className="pc-check" data-state={item.state} data-code={item.code}>
                <span className="pc-check__icon" aria-hidden="true">{item.state === 'blocker' ? '!' : 'i'}</span>
                <span>
                  <span className="pc-check__title">{item.state === 'blocker' ? 'Cần sửa' : 'Lưu ý'}</span>
                  <span className="pc-check__text" style={{ display: 'block' }}>{messageFor(item.code, item.params).text}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="pc-checklist">
            <li className="pc-check" data-state="ok">
              <span className="pc-check__icon" aria-hidden="true">✓</span>
              <span><span className="pc-check__title">Bước này đã đủ thông tin</span></span>
            </li>
          </ul>
        )}
      </section>
      {nextHint ? (
        <section className="pc-card">
          <p className="pc-eyebrow">Bước kế tiếp</p>
          <p style={{ margin: 0 }}>{nextHint}</p>
        </section>
      ) : null}
    </aside>
  );
}

export function StudioActionBar({ step, save, dirty, busy, canAdvance, onBack, onSave, onNext }) {
  const errorText = save.status === 'error' ? messageFor(save.error?.code === 'SETUP_SAVE_TIMEOUT' ? 'SETUP_SAVE_FAILED' : (save.error?.code || 'SETUP_SAVE_FAILED')).text : '';
  const nextLabel = step < 4 ? (dirty ? `Lưu & tiếp tục (Bước ${step + 1})` : `Tiếp tục (Bước ${step + 1})`) : null;
  return (
    <div className="pc-actionbar">
      <div className="pc-actionbar__inner">
        <button type="button" className="pc-btn" onClick={onBack} disabled={step === 1 || busy}>‹ Quay lại</button>
        <div className="pc-actionbar__status" aria-live="polite">
          <span className="pc-save-status" data-status={save.status}>{saveStatusText(save)}</span>
          {errorText ? <span className="pc-field__error" data-code={save.error?.code}>{errorText}</span> : null}
        </div>
        <button type="button" className="pc-btn pc-btn--soft" onClick={onSave} disabled={busy || (!dirty && save.status !== 'idle')}>
          {save.status === 'error' ? 'Thử lưu lại' : 'Lưu nháp'}
        </button>
        {nextLabel ? (
          <button type="button" className="pc-btn pc-btn--primary" onClick={onNext} disabled={busy || !canAdvance} aria-disabled={!canAdvance || undefined}>
            {nextLabel} ›
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function StudioDialog({ title, children, actions, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('button')?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div className="pc-dialog-backdrop" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div ref={ref} className="pc-dialog" role="dialog" aria-modal="true" aria-labelledby="pc-dialog-title">
        <h2 id="pc-dialog-title">{title}</h2>
        {children}
        <div className="pc-btn-row">{actions}</div>
      </div>
    </div>
  );
}
