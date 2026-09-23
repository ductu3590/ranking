'use client';

import '../draw/draw-review.css';
import { buildReviewSummaryModel } from '../draw/drawReviewModel';

export function TournamentDetailsForm({ tournament, onChange }) {
  const update = (key, value) => onChange?.({ ...tournament, [key]: value });
  return (
    <div className="setup-tournament-details">
      <label>Tên giải<input value={tournament.name || ''} onChange={(event) => update('name', event.target.value)} placeholder="Ví dụ: Giải nội bộ tháng 9" /></label>
      <label>Ngày thi đấu<input type="date" value={tournament.eventDate || ''} onChange={(event) => update('eventDate', event.target.value)} /></label>
      <label>Giờ bắt đầu<input type="time" value={tournament.startTime || ''} onChange={(event) => update('startTime', event.target.value)} /></label>
      <label>Địa điểm<input value={tournament.location || ''} onChange={(event) => update('location', event.target.value)} placeholder="Ví dụ: Sân PickHub" /></label>
      <label>Mô tả<textarea rows="3" value={tournament.description || ''} onChange={(event) => update('description', event.target.value)} placeholder="Giới thiệu ngắn về giải đấu" /></label>
      <label>Áp phích giải<input type="url" value={tournament.posterUrl || ''} onChange={(event) => update('posterUrl', event.target.value)} placeholder="Dán liên kết ảnh áp phích" /><small>Tải ảnh trực tiếp sẽ được bổ sung sau khi cấu hình kho lưu trữ áp phích an toàn.</small></label>
    </div>
  );
}

// Không có nút "Thử lại" riêng: TournamentWizard không truyền onRetry, và cả hai nút
// "Lưu nháp" / "Chốt" đều tự bật lại sau khi lỗi (SetupActionBar + hàng nút dưới đây),
// nên bấm lại chính nút đó là thử lại. Một nút không nối handler chỉ gây hiểu nhầm.
export default function ReviewFinalizeStep({ draft = {}, saveState = {}, finalizeState = {}, onSaveDraft, onFinalize, onDraftChange }) {
  const review = buildReviewSummaryModel(draft);
  // Pending/error CỤC BỘ cho hành động khởi chạy từ chính bước này. saveState /
  // finalizeState đến từ shell; retry chưa có nguồn nào nên phải tự giữ (LOAD-02).
  const saving = saveState.status === 'saving';
  const finalizing = finalizeState.status === 'finalizing';
  const busy = saving || finalizing;

  return (
    <section className="setup-review-panel" aria-label="Kiểm tra và chốt lịch">
      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Tóm tắt tính toán</p>
        <h3>Kiểm tra trước khi chốt</h3>
        <div className="setup-summary-text">{review.summaryText}</div>
        {review.metrics.thirdPlaceMatches ? <p>Có tranh hạng ba nên tổng tăng thêm 1 trận.</p> : null}
        {review.warnings.map((warning) => <div className="setup-status-item warning" key={warning.code}>Lưu ý: {warning.message}</div>)}
      </div>

      <div className="setup-draw-card">
        <p className="setup-draw-eyebrow">Kiểm tra sẵn sàng</p>
        <h3>Trạng thái sẵn sàng</h3>
        <div className="setup-status-list">
          {review.blockers.length ? review.blockers.map((blocker) => (
            <div className="setup-status-item blocker" key={blocker.code}>{blocker.message}</div>
          )) : <div className="setup-status-item warning">Không có blocker. Có thể chốt nếu BTC đã kiểm tra lịch.</div>}
          {review.warnings.map((warning) => <div className="setup-status-item warning" key={warning.code}>Lưu ý: {warning.message}</div>)}
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
          <button className="setup-secondary-action" type="button" aria-busy={saving} onClick={() => onSaveDraft?.()} disabled={busy}>{saving ? 'Đang lưu...' : 'Lưu nháp'}</button>
          <button className="setup-primary-action" type="button" aria-busy={finalizing} onClick={() => onFinalize?.({ destination: 'schedule' })} disabled={review.finalizeDisabled || busy}>{finalizing ? 'Đang chốt...' : 'Chốt bốc thăm & tạo lịch'}</button>
        </div>
      </div>
    </section>
  );
}
