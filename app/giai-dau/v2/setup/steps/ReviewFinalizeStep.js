'use client';

import '../draw/draw-review.css';
import { buildReviewSummaryModel } from '../draw/drawReviewModel';

export default function ReviewFinalizeStep({ draft = {}, saveState = {}, finalizeState = {}, onSaveDraft, onFinalize, onRetry }) {
  const review = buildReviewSummaryModel(draft);
  const saving = saveState.status === 'saving';
  const finalizing = finalizeState.status === 'finalizing';

  return (
    <section className="setup-review-panel" aria-label="Bước 4: kiểm tra và chốt">
      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Tóm tắt tính toán</p>
        <h3>Kiểm tra trước khi chốt</h3>
        <div className="setup-summary-text">{review.summaryText}</div>
        {review.metrics.thirdPlaceMatches ? <p>Có tranh hạng ba nên tổng tăng thêm 1 trận.</p> : null}
        {review.warnings.map((warning) => <div className="setup-status-item warning" key={warning.code}>Warning: {warning.message}</div>)}
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Blocker / warning</p>
        <h3>Trạng thái sẵn sàng</h3>
        <div className="setup-status-list">
          {review.blockers.length ? review.blockers.map((blocker) => (
            <div className="setup-status-item blocker" key={blocker.code}>Blocker: {blocker.message}</div>
          )) : <div className="setup-status-item warning">Không có blocker. Có thể chốt nếu BTC đã kiểm tra lịch.</div>}
          {review.warnings.map((warning) => <div className="setup-status-item warning" key={warning.code}>Warning: {warning.message}</div>)}
        </div>
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Hành động</p>
        <h3>Lưu nháp hoặc chốt tạo lịch</h3>
        <p>Sau finalize điều hướng tới Lịch thi đấu ({review.destinationLabel}), không tự chuyển giải sang LIVE.</p>
        {review.finalizeDisabled ? <div className="setup-status-item blocker">Không thể chốt: {review.finalizeDisabledReason}</div> : null}
        {saveState.error ? <div className="setup-status-item blocker">Lưu nháp lỗi: {saveState.error}</div> : null}
        {finalizeState.error ? <div className="setup-status-item blocker">Chốt lịch lỗi: {finalizeState.error}</div> : null}
        <div className="setup-action-row">
          <button className="setup-secondary-action" type="button" onClick={() => onSaveDraft?.()} disabled={saving || finalizing}>{saving ? 'Đang lưu...' : 'Lưu nháp'}</button>
          <button className="setup-primary-action" type="button" onClick={() => onFinalize?.({ destination: 'schedule' })} disabled={review.finalizeDisabled || saving || finalizing}>{finalizing ? 'Đang chốt...' : 'Chốt bốc thăm & tạo lịch'}</button>
          <button className="setup-secondary-action" type="button" onClick={() => onRetry?.()} disabled={saving || finalizing}>Thử lại</button>
        </div>
      </div>
    </section>
  );
}
