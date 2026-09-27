'use client';

import { useEffect, useId, useState } from 'react';
import { setFriendlyWindow } from '@/lib/tournamentV2Client';
import { deadlineLeft } from '../../../loi-moi/invitationGroups';
import { deadlineToIso, errorText, isoToDeadlineParts, timeLabel } from './friendlyUi';

function statusOf(window) {
  if (!window) return { tone: 'wait', text: '' };
  if (window.reason === 'LOCKED') return { tone: 'off', text: `Đã khoá lúc ${timeLabel(window.lockedAt)}` };
  if (window.reason === 'DEADLINE_PASSED') return { tone: 'fix', text: 'Đã qua hạn' };
  if (window.reason === 'FINALIZED') return { tone: 'off', text: 'Giải đã chốt' };
  const left = window.deadline ? deadlineLeft(window.deadline) : '';
  return { tone: 'ok', text: left ? `Đang mở · ${left.toLowerCase()}` : 'Đang mở' };
}

// Hạn chót + khoá/mở đăng ký của CLB khách (D42, Stitch FRD-01 (e), spec F3 §3.2). Mọi ghi qua POST /friendly/window.
export default function RegistrationWindowCard({ tournamentId, window, onChanged }) {
  const base = useId();
  const initial = isoToDeadlineParts(window?.deadline);
  const [date, setDate] = useState(window?.deadline ? initial.date : '');
  const [time, setTime] = useState(initial.time);
  const [confirmLock, setConfirmLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const parts = isoToDeadlineParts(window?.deadline);
    setDate(window?.deadline ? parts.date : '');
    setTime(parts.time);
  }, [window?.deadline]);

  const status = statusOf(window);
  const closed = window?.reason === 'LOCKED' || window?.reason === 'DEADLINE_PASSED';
  const finalized = window?.reason === 'FINALIZED';
  const typedIso = deadlineToIso(date, time);
  const changed = (typedIso ? Date.parse(typedIso) : null) !== (window?.deadline ? Date.parse(window.deadline) : null);

  async function apply({ deadline, locked }) {
    setBusy(true);
    setError('');
    try {
      const result = await setFriendlyWindow({ tournamentId, deadline, locked });
      setConfirmLock(false);
      onChanged?.(result.window);
    } catch (windowError) {
      setError(errorText(windowError));
    } finally {
      setBusy(false);
    }
  }

  // Mở lại: bỏ hạn chót đã qua, trừ khi người dùng vừa nhập hạn mới ở tương lai.
  const reopenDeadline = typedIso && Date.parse(typedIso) > Date.now() ? typedIso : null;

  return (
    <section className="pc-card fr-window" aria-labelledby={`${base}-title`}>
      <div className="pc-card__head">
        <h3 id={`${base}-title`} className="pc-card__title">Đăng ký của CLB khách</h3>
        {status.text ? <span className="fr-status" data-tone={status.tone}>{status.text}</span> : null}
      </div>
      <div className="pc-field">
        <span className="pc-field__label"><span>Hạn chót (tùy chọn)</span><small>Gợi ý 23:59</small></span>
        <div className="pc-grid pc-grid--2 fr-window__inputs">
          <label className="pc-visually-hidden" htmlFor={`${base}-date`}>Ngày hạn chót</label>
          <input id={`${base}-date`} type="date" className="pc-input" value={date} disabled={finalized || busy} onChange={(event) => setDate(event.target.value)} />
          <label className="pc-visually-hidden" htmlFor={`${base}-time`}>Giờ hạn chót</label>
          <input id={`${base}-time`} type="time" className="pc-input" value={time} disabled={finalized || busy} onChange={(event) => setTime(event.target.value || '23:59')} />
        </div>
      </div>
      {!finalized && !closed && changed ? (
        <div className="pc-btn-row">
          <button type="button" className="pc-btn pc-btn--sm pc-btn--soft" disabled={busy} onClick={() => apply({ deadline: typedIso, locked: false })}>Lưu hạn chót</button>
        </div>
      ) : null}
      {!finalized && !closed && window?.deadline && !changed ? (
        <div className="pc-btn-row">
          <button type="button" className="pc-btn pc-btn--sm pc-btn--ghost" disabled={busy} onClick={() => apply({ deadline: null, locked: false })}>Bỏ hạn chót</button>
        </div>
      ) : null}
      {error ? <p className="pc-field__error" role="alert">{error}</p> : null}
      {finalized ? null : closed ? (
        <>
          <button type="button" className="pc-btn fr-window__toggle" disabled={busy} onClick={() => apply({ deadline: reopenDeadline, locked: false })}>🔓 Mở lại đăng ký</button>
          {window?.reason === 'DEADLINE_PASSED' && !reopenDeadline ? <p className="pc-field__help">Mở lại sẽ bỏ hạn chót đã qua. Muốn đặt hạn mới, chọn ngày giờ ở trên trước.</p> : null}
        </>
      ) : confirmLock ? (
        <div className="pc-notice pc-notice--warn fr-confirm" role="alertdialog" aria-labelledby={`${base}-lock`}>
          <p id={`${base}-lock`}><strong>Khoá đăng ký?</strong> CLB khách sẽ không sửa được danh sách.</p>
          <div className="pc-btn-row">
            <button type="button" className="pc-btn pc-btn--sm" disabled={busy} onClick={() => setConfirmLock(false)}>Huỷ</button>
            <button type="button" className="pc-btn pc-btn--sm pc-btn--primary" disabled={busy} onClick={() => apply({ deadline: window?.deadline || null, locked: true })}>Khoá đăng ký</button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="pc-btn fr-window__toggle" disabled={busy} onClick={() => setConfirmLock(true)}>🔒 Khoá đăng ký</button>
          <p className="pc-field__help">Khi khoá, CLB khách không sửa được danh sách.</p>
        </>
      )}
    </section>
  );
}
