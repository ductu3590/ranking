'use client';

import { SAVE_STATUS_LABELS } from './SetupContext';

export default function SetupActionBar({
  currentStep,
  stepCount,
  saveStatus,
  saveError,
  finalizeError,
  canFinalize,
  isFinalizing,
  onBack,
  onNext,
  onSave,
  onFinalize,
}) {
  const isFirst = currentStep <= 1;
  const isLast = currentStep >= stepCount;
  const saving = saveStatus === 'saving';

  return (
    <div className="setup-actionbar" role="region" aria-label="Hành động thiết lập giải">
      <div className="setup-actionbar__status" aria-live="polite">
        <strong>{SAVE_STATUS_LABELS[saveStatus] || SAVE_STATUS_LABELS.idle}</strong>
        {saveError ? <span className="setup-actionbar__error">{saveError}</span> : null}
        {finalizeError ? <span className="setup-actionbar__error">{finalizeError}</span> : null}
      </div>
      <div className="setup-actionbar__buttons">
        <button type="button" className="setup-btn setup-btn--ghost" onClick={onBack} disabled={isFirst || saving || isFinalizing}>
          Quay lại
        </button>
        <button type="button" className="setup-btn setup-btn--secondary" onClick={() => { Promise.resolve(onSave?.()).catch(() => {}); }} disabled={saving || isFinalizing}>
          {saving ? 'Đang lưu...' : 'Lưu nháp'}
        </button>
        {isLast ? (
          <button type="button" className="setup-btn setup-btn--primary" onClick={() => { Promise.resolve(onFinalize?.()).catch(() => {}); }} disabled={!canFinalize || saving || isFinalizing}>
            {isFinalizing ? 'Đang chốt...' : 'Chốt bốc thăm & tạo lịch'}
          </button>
        ) : (
          <button type="button" className="setup-btn setup-btn--primary" onClick={onNext} disabled={saving || isFinalizing}>
            Tiếp tục
          </button>
        )}
      </div>
    </div>
  );
}
