'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { allowedStep } from '@/lib/tournament/setupStepRules';
import { useSetupStudio } from './useSetupStudio';
import { ReadinessRail, StudioActionBar, StudioDialog, StudioHeader, StudioStepper } from './StudioChrome';
import StepInfo from './steps/StepInfo';
import StepParticipants from './steps/StepParticipants';
import StepFormatPairing from './steps/StepFormatPairing';
import StepDraw from './steps/StepDraw';
import './studio.css';

// Font self-host lúc build (không gọi Google Fonts lúc chạy), chỉ áp trong shell setup.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700', '800'], variable: '--pc-font', display: 'swap' });

const NEXT_HINT = {
  1: 'Chọn thành viên CLB và khách mời tham gia.',
  2: 'Chọn thể thức và ghép cặp đánh đôi.',
  3: 'Bốc thăm, xem trước lịch và chốt giải.',
  4: null,
};

export default function SetupStudio({ tournamentId, divisionId, step: requestedStep, onExit }) {
  const router = useRouter();
  const pathname = usePathname();
  const studio = useSetupStudio({ tournamentId, divisionId, step: requestedStep });
  const { save, step, setStep, readiness, dirty, edit, persist, discard, reloadFromServer } = studio;
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState({});
  const [pendingNav, setPendingNav] = useState(null);
  const mainRef = useRef(null);

  // URL phản ánh giải + bước để reload quay về đúng chỗ. replace: không chồng lịch sử.
  useEffect(() => {
    if (!save.tournamentId) return;
    const params = new URLSearchParams({ create: 'internal', tournamentId: save.tournamentId, divisionId: save.divisionId, step: String(step) });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, save.tournamentId, save.divisionId, step]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const moveTo = useCallback((target, completedThrough = save.completedThrough) => {
    const next = allowedStep(target, completedThrough);
    setStep(next);
    requestAnimationFrame(() => mainRef.current?.focus?.());
  }, [save.completedThrough, setStep]);

  // Rời bước khi còn thay đổi chưa lưu → hỏi Lưu / Bỏ / Ở lại (spec Lát 0 §4.2).
  const requestNav = useCallback((target) => {
    if (target === step) return;
    if (target !== 'exit' && target > allowedStep(target, save.completedThrough)) return;
    if (dirty) { setPendingNav(target); return; }
    if (target === 'exit') onExit?.();
    else moveTo(target);
  }, [dirty, moveTo, onExit, save.completedThrough, step]);

  const doSave = useCallback(async () => {
    if (!save.draft.tournament.name.trim()) {
      setShowErrors((current) => ({ ...current, 1: true }));
      if (step !== 1) moveTo(1);
      return { ok: false };
    }
    setBusy(true);
    try { return await persist(); } finally { setBusy(false); }
  }, [moveTo, persist, save.draft.tournament.name, step]);

  const goNext = useCallback(async () => {
    let completedThrough = save.completedThrough;
    if (dirty || save.status === 'idle') {
      const result = await doSave();
      if (!result?.ok) return;
      completedThrough = result.completedThrough;
    }
    if (completedThrough >= step) moveTo(step + 1, completedThrough);
    else {
      setShowErrors((current) => ({ ...current, [step]: true }));
      requestAnimationFrame(() => document.querySelector('.pc-rail .pc-check[data-state="blocker"]')?.scrollIntoView?.({ block: 'center' }));
    }
  }, [dirty, doSave, moveTo, save.completedThrough, save.status, step]);

  const resolveNav = useCallback(async (choice) => {
    const target = pendingNav;
    if (choice === 'stay') { setPendingNav(null); return; }
    if (choice === 'discard') {
      discard();
      setPendingNav(null);
      if (target === 'exit') onExit?.();
      else moveTo(target);
      return;
    }
    const result = await doSave();
    setPendingNav(null);
    if (!result?.ok) return;
    if (target === 'exit') onExit?.();
    else moveTo(target, result.completedThrough);
  }, [discard, doSave, moveTo, onExit, pendingNav]);

  if (studio.loadError) {
    return (
      <div className={`pc-studio ${jakarta.variable}`}>
        <div className="pc-layout"><div className="pc-notice pc-notice--error" role="alert"><p>{studio.loadError}</p></div></div>
      </div>
    );
  }

  const draft = save.draft;
  const participants = draft.participants.memberIds.length + draft.participants.guests.length;
  const summaries = {
    1: draft.tournament.eventDate ? draft.tournament.eventDate.split('-').reverse().join('/') : '',
    2: participants ? `${participants} VĐV` : '',
    3: draft.pairs.length ? `${draft.pairs.length} cặp` : '',
  };
  const stepProps = { draft, readiness, showErrors: Boolean(showErrors[step]), onChange: edit };

  return (
    <div className={`pc-studio ${jakarta.variable}`}>
      <StudioHeader title={draft.tournament.name} save={save} onBack={() => requestNav('exit')} />
      <StudioStepper step={step} completedThrough={save.completedThrough} summaries={summaries} onSelect={requestNav} />

      {save.status === 'conflict' ? (
        <div className="pc-layout" style={{ paddingBottom: 0 }}>
          <div className="pc-notice pc-notice--warn" role="alert" style={{ flexDirection: 'column' }}>
            <p><strong>Bản nháp vừa được sửa ở nơi khác.</strong> Thay đổi của bạn vẫn còn trên màn hình.</p>
            <div className="pc-btn-row">
              <button type="button" className="pc-btn pc-btn--sm" onClick={() => reloadFromServer('reload')}>Tải bản mới (bỏ thay đổi của tôi)</button>
              <button type="button" className="pc-btn pc-btn--sm pc-btn--soft" onClick={() => reloadFromServer('keep')}>Giữ bản của tôi</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pc-layout">
        <main ref={mainRef} className="pc-main" tabIndex={-1} aria-busy={studio.loading || undefined}>
          {studio.loading ? <section className="pc-card"><p className="pc-empty">Đang tải bản nháp…</p></section> : (
            <>
              {step === 1 ? <StepInfo {...stepProps} /> : null}
              {step === 2 ? <StepParticipants {...stepProps} roster={studio.roster} rosterLoading={!studio.roster.length && studio.loading} /> : null}
              {step === 3 ? <StepFormatPairing {...stepProps} roster={studio.roster} onGoToStep={requestNav} /> : null}
              {step === 4 ? <StepDraw {...stepProps} /> : null}
            </>
          )}
        </main>
        <ReadinessRail step={step} readiness={readiness} nextHint={NEXT_HINT[step]} />
      </div>

      <StudioActionBar
        step={step} save={save} dirty={dirty} busy={busy || save.status === 'saving'} canAdvance
        onBack={() => requestNav(step - 1)} onSave={doSave} onNext={goNext}
      />

      {pendingNav != null ? (
        <StudioDialog
          title="Bạn có thay đổi chưa lưu"
          onClose={() => resolveNav('stay')}
          actions={(
            <>
              <button type="button" className="pc-btn" onClick={() => resolveNav('stay')}>Ở lại</button>
              <button type="button" className="pc-btn pc-btn--danger" onClick={() => resolveNav('discard')}>Bỏ thay đổi chưa lưu</button>
              <button type="button" className="pc-btn pc-btn--primary" onClick={() => resolveNav('save')}>Lưu</button>
            </>
          )}
        >
          <p>Lưu trước khi rời bước này, hoặc bỏ các thay đổi chưa lưu.</p>
        </StudioDialog>
      ) : null}
    </div>
  );
}
