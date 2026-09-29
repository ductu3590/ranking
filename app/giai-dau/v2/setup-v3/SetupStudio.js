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
import { useDrawProgress } from './DrawProgress';
import FriendlyDrawGate from './friendly/FriendlyDrawGate';
import FinalizedLinkDialog from './friendly/FinalizedLinkDialog';
import { onlyWaitingForClubs } from './friendly/friendlyContext';
import './studio.css';

// Font self-host lúc build (không gọi Google Fonts lúc chạy), chỉ áp trong shell setup.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700', '800'], variable: '--pc-font', display: 'swap' });

const NEXT_HINT = {
  1: 'Chọn thành viên CLB và khách mời tham gia.',
  2: 'Ghép cặp đánh đôi, chọn thể thức và số sân.',
  3: 'Bốc thăm, xem trước lịch và chốt giải.',
  4: null,
};
const COMMUNITY_NEXT_HINT = { ...NEXT_HINT, 1: 'Xem các cặp đã duyệt ở đăng ký.', 2: 'Chọn thể thức và số sân cho các cặp đã duyệt.' };
const FRIENDLY_NEXT_HINT = { ...NEXT_HINT, 1: 'Chọn thành viên CLB bạn và mời CLB khác.', 2: 'Ghép cặp của CLB bạn, xem cặp CLB khách, chọn thể thức và số sân.' };

// registrationsHref: (chỉ giải cộng đồng) đường dẫn tới bảng duyệt đăng ký của nội dung đang dựng.
export default function SetupStudio({ tournamentId, divisionId, step: requestedStep, organizerMode = 'internal', onExit, registrationsHref = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const studio = useSetupStudio({ tournamentId, divisionId, step: requestedStep, organizerMode });
  const { save, step, setStep, readiness, dirty, edit, persist, discard, reloadFromServer, draw, finalize, isFriendly, friendly, reloadFriendly, isCommunity, community, reloadCommunity } = studio;
  const [finalized, setFinalized] = useState(null);
  // Thanh % khi bốc thăm / cập nhật xem trước / chốt (mọi thể thức). Chỉ bọc lời gọi cũ, không đổi API.
  const { progress: drawProgress, run: runWithProgress } = useDrawProgress();
  // Giải giao hữu (D52): chủ nhà làm xong phần mình ở Bước 1–3; nếu chỉ còn chờ CLB khách thì Bước 4 mở ở dạng bị chặn.
  const gateOpen = isFriendly && save.completedThrough >= 2 && onlyWaitingForClubs(readiness.byStep[3]);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState({});
  const [pendingNav, setPendingNav] = useState(null);
  const mainRef = useRef(null);

  // URL phản ánh giải + bước để reload quay về đúng chỗ. replace: không chồng lịch sử.
  useEffect(() => {
    if (!save.tournamentId) return;
    const params = new URLSearchParams({ create: isFriendly ? 'friendly' : 'internal', tournamentId: save.tournamentId, divisionId: save.divisionId, step: String(step) });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [isFriendly, pathname, router, save.tournamentId, save.divisionId, step]);

  // Giải giao hữu: quay lại Bước 2–4 thì tải lại khối CLB tham dự (CLB khách có thể vừa gửi/sửa danh sách).
  useEffect(() => {
    if (isFriendly && step >= 2) reloadFriendly();
  }, [isFriendly, reloadFriendly, step]);

  // Giải cộng đồng: quay lại Bước 2–4 thì tải lại khối cặp đã duyệt (admin có thể vừa duyệt / ghép hộ ở bảng duyệt).
  useEffect(() => {
    if (isCommunity && step >= 2) reloadCommunity();
  }, [isCommunity, reloadCommunity, step]);

  // Giải đã chốt không mở lại màn thiết lập (spec Lát 0 §10): chuyển tới mục Điều hành.
  useEffect(() => {
    if (save.draft.state === 'finalized' && save.tournamentId) router.replace(`/dieu-hanh-giai/${save.tournamentId}?step=control`);
  }, [router, save.draft.state, save.tournamentId]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const moveTo = useCallback((target, completedThrough = save.completedThrough) => {
    const next = target === 4 && gateOpen ? 4 : allowedStep(target, completedThrough);
    setStep(next);
    requestAnimationFrame(() => mainRef.current?.focus?.());
  }, [gateOpen, save.completedThrough, setStep]);

  // Rời bước khi còn thay đổi chưa lưu → hỏi Lưu / Bỏ / Ở lại (spec Lát 0 §4.2).
  const requestNav = useCallback((target) => {
    if (target === step) return;
    if (target !== 'exit' && target > allowedStep(target, save.completedThrough) && !(target === 4 && gateOpen)) return;
    if (dirty) { setPendingNav(target); return; }
    if (target === 'exit') onExit?.();
    else moveTo(target);
  }, [dirty, gateOpen, moveTo, onExit, save.completedThrough, step]);

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
    else if (step === 3 && gateOpen) setStep(4);
    else {
      setShowErrors((current) => ({ ...current, [step]: true }));
      requestAnimationFrame(() => document.querySelector('.pc-rail .pc-check[data-state="blocker"]')?.scrollIntoView?.({ block: 'center' }));
    }
  }, [dirty, doSave, gateOpen, moveTo, save.completedThrough, save.status, setStep, step]);

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
  // Giải cộng đồng: người tham gia = các cặp đã duyệt (2 VĐV mỗi cặp), không chọn từng người.
  const communityPairCount = isCommunity ? (community?.approvedPairs || []).length : 0;
  const participants = isCommunity ? communityPairCount * 2 : draft.participants.memberIds.length + draft.participants.guests.length;
  // Giải giao hữu: tổng cặp = cặp của CLB mình + cặp CLB khách đã duyệt.
  const guestPairCount = isFriendly ? (friendly?.approvedPairs || []).length : 0;
  const pairTotal = isCommunity ? communityPairCount : draft.pairs.length + guestPairCount;
  const summaries = {
    1: draft.tournament.eventDate ? draft.tournament.eventDate.split('-').reverse().join('/') : '',
    2: participants ? `${participants} VĐV` : '',
    3: pairTotal ? `${pairTotal} cặp${draft.tournament.courtCount ? ` · ${draft.tournament.courtCount} sân` : ''}` : '',
  };
  const stepProps = { draft, readiness, showErrors: Boolean(showErrors[step]), onChange: edit };
  const friendlyProps = isFriendly ? { friendly, pairTotal } : {};
  const communityProps = isCommunity ? { community, pairTotal, registrationsHref } : {};
  const showGate = isFriendly && step === 4 && save.completedThrough < 3;

  return (
    <div className={`pc-studio ${jakarta.variable}`}>
      <StudioHeader title={draft.tournament.name} save={save} onBack={() => requestNav('exit')} friendly={isFriendly} community={isCommunity} />
      <StudioStepper step={step} completedThrough={save.completedThrough} summaries={summaries} onSelect={requestNav} extraOpenStep={gateOpen ? 4 : null} />

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
              {step === 1 ? <StepInfo {...stepProps} modeLocked={Boolean(save.tournamentId)} community={isCommunity} registrationsHref={registrationsHref} /> : null}
              {step === 2 ? (
                <StepParticipants
                  {...stepProps} roster={studio.roster} rosterLoading={!studio.roster.length && studio.loading}
                  friendly={friendly} tournamentId={save.tournamentId} onFriendlyChanged={reloadFriendly}
                  {...communityProps} onReloadCommunity={reloadCommunity}
                />
              ) : null}
              {step === 3 ? <StepFormatPairing {...stepProps} {...friendlyProps} {...communityProps} roster={studio.roster} onGoToStep={requestNav} /> : null}
              {showGate ? <FriendlyDrawGate draft={draft} readiness={readiness} friendly={friendly} onGoToStep={requestNav} /> : null}
              {step === 4 && !showGate ? (
                <StepDraw
                  {...stepProps}
                  {...friendlyProps}
                  {...communityProps}
                  roster={studio.roster}
                  busy={busy || save.status === 'saving'}
                  finalizing={studio.finalizing}
                  finalizeError={studio.finalizeError}
                  progress={drawProgress}
                  onDraw={async (action) => {
                    setBusy(true);
                    try { await runWithProgress(action === 'preview' ? 'preview' : 'draw', () => draw(action)); } finally { setBusy(false); }
                  }}
                  onFinalize={async () => {
                    const outcome = await runWithProgress('finalize', () => finalize());
                    if (!outcome.ok) return;
                    // D50: giải giao hữu sau chốt có link xem (không liệt kê) — hiện link trước khi vào bàn điều hành.
                    if (outcome.result?.publicUrl) setFinalized(outcome.result);
                    else router.push(outcome.result?.redirect || '/giai-dau/v2');
                  }}
                />
              ) : null}
            </>
          )}
        </main>
        <ReadinessRail step={showGate ? 3 : step} readiness={readiness} nextHint={(isCommunity ? COMMUNITY_NEXT_HINT : isFriendly ? FRIENDLY_NEXT_HINT : NEXT_HINT)[step]} />
      </div>

      <StudioActionBar
        step={step} save={save} dirty={dirty} busy={busy || save.status === 'saving'} canAdvance
        onBack={() => requestNav(step - 1)} onSave={doSave} onNext={goNext}
      />

      {finalized ? (
        <FinalizedLinkDialog publicUrl={finalized.publicUrl} onContinue={() => router.push(finalized.redirect || '/giai-dau/v2')} />
      ) : null}

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
