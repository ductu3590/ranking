'use client';

import './setup.css';
import './pro-court.css';
import SetupActionBar from './SetupActionBar';
import { SETUP_STEPS, TournamentSetupProvider, useTournamentSetup } from './SetupContext';
import SetupStepper from './SetupStepper';
import SetupSummaryRail from './SetupSummaryRail';

function PlaceholderStep({ step }) {
  return (
    <section className="setup-panel" aria-labelledby={`setup-step-${step.id}-title`} tabIndex={-1}>
      <p className="setup-eyebrow">Bước {step.id}</p>
      <h2 id={`setup-step-${step.id}-title`}>{step.label}</h2>
      <p>{step.description}</p>
      <div className="setup-placeholder">
        <strong>Đang chờ component chuyên trách.</strong>
        <span>Shell giữ resume state, guard bước và thanh hành động; T2.B/T2.C sẽ gắn nội dung nghiệp vụ vào vùng này.</span>
      </div>
    </section>
  );
}

function WorkspaceInner({ renderStep }) {
  const {
    state,
    steps,
    currentStepMeta,
    blockers,
    warnings,
    canFinalize,
    goToStep,
    saveDraft,
    finalizeDraft,
    dispatch,
  } = useTournamentSetup();

  const stepCount = steps.length;
  const goNext = () => {
    const nextStep = Math.min(state.currentStep + 1, stepCount);
    dispatch({ type: 'unlockStep', step: nextStep });
    goToStep(nextStep);
  };
  const goBack = () => goToStep(Math.max(state.currentStep - 1, 1));
  const renderedStep = renderStep ? renderStep({ step: currentStepMeta, state, dispatch }) : <PlaceholderStep step={currentStepMeta} />;

  return (
    <div className="setup-workspace" data-setup-step={state.currentStep}>
      <div className="setup-brandbar"><span className="setup-brandmark" aria-hidden="true">P</span><strong>PickHub <span>PRO COURT OS</span></strong><span className="setup-brandbar__context">Không gian tổ chức giải</span></div>
      <header className="setup-hero">
        <div>
          <p className="setup-eyebrow">Giải đấu / Thiết lập giải nội bộ</p>
          <h1>{currentStepMeta.label}</h1>
          <p>{currentStepMeta.description}. Thiết lập từng bước, sẵn sàng ra sân.</p>
        </div>
        <span className="setup-hero__progress">Bước <strong>{state.currentStep}</strong> / {stepCount}</span>
      </header>

      <SetupStepper
        steps={steps}
        currentStep={state.currentStep}
        highestAllowedStep={state.highestAllowedStep}
        focusActive={state.focusStepAfterChange}
        onStepChange={(step) => goToStep(step)}
      />

      <div className="setup-layout">
        <main className="setup-main" aria-live="polite">
          {renderedStep}
        </main>
        <SetupSummaryRail
          draft={state.draft}
          saveStatus={state.saveStatus}
          lastSavedAt={state.lastSavedAt}
          blockers={blockers}
          warnings={warnings}
        />
      </div>

      <SetupActionBar
        currentStep={state.currentStep}
        stepCount={stepCount}
        saveStatus={state.saveStatus}
        saveError={state.saveError}
        finalizeError={state.finalizeError}
        canFinalize={canFinalize}
        isFinalizing={state.isFinalizing}
        onBack={goBack}
        onNext={goNext}
        onSave={saveDraft}
        onFinalize={finalizeDraft}
      />
    </div>
  );
}

export default function TournamentSetupWorkspace({ initialDraft, adapter, resumeStep, renderStep }) {
  return (
    <TournamentSetupProvider initialDraft={initialDraft} adapter={adapter} resumeStep={resumeStep}>
      <WorkspaceInner renderStep={renderStep} />
    </TournamentSetupProvider>
  );
}

export { SETUP_STEPS };
