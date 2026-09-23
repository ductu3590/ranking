'use client';

import { SAVE_STATUS_LABELS } from './SetupContext';

function countSelected(participants) {
  const ids = participants?.memberIds || participants?.selectedMemberIds;
  return Array.isArray(ids) ? ids.length : 0;
}

function formatDateLabel(value) {
  if (!value) return 'Chưa chọn ngày';
  try {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
  } catch {
    return value;
  }
}

function renderCodeItem(item) {
  if (typeof item === 'string') return item;
  return item?.message || item?.code || 'Chưa rõ nội dung';
}

export default function SetupSummaryRail({ draft, saveStatus, lastSavedAt, blockers, warnings }) {
  const participantCount = countSelected(draft.participants);
  const pairCount = Array.isArray(draft.pairs) ? draft.pairs.length : 0;
  const stageCount = Array.isArray(draft.draw?.stagePlans) ? draft.draw.stagePlans.length : 0;

  return (
    <aside className="setup-summary" aria-label="Tóm tắt thiết lập">
      <section className="setup-summary__card setup-summary__card--hero">
        <p className="setup-eyebrow">Tóm tắt nháp</p>
        <h2>{draft.tournament?.name || 'Giải nội bộ chưa đặt tên'}</h2>
        <dl className="setup-summary__facts">
          <div><dt>Ngày đấu</dt><dd>{formatDateLabel(draft.tournament?.eventDate)}</dd></div>
          <div><dt>Địa điểm</dt><dd>{draft.tournament?.location || 'Chưa nhập'}</dd></div>
          <div><dt>Trạng thái</dt><dd>{draft.state || 'local_only'}</dd></div>
        </dl>
      </section>

      <section className="setup-summary__card">
        <h3>Tiến độ</h3>
        <div className="setup-metrics" role="list">
          <div className="setup-metric" role="listitem"><strong>{participantCount}</strong><span>VĐV chọn</span></div>
          <div className="setup-metric" role="listitem"><strong>{pairCount}</strong><span>Cặp đấu</span></div>
          <div className="setup-metric" role="listitem"><strong>{stageCount}</strong><span>Giai đoạn</span></div>
        </div>
        <p className={`setup-save-chip is-${saveStatus}`} aria-live="polite">
          {SAVE_STATUS_LABELS[saveStatus] || SAVE_STATUS_LABELS.idle}
          {saveStatus === 'saved' && lastSavedAt ? ` lúc ${new Date(lastSavedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </p>
      </section>

      <section className="setup-summary__card">
        <h3>Readiness</h3>
        {blockers.length ? (
          <ul className="setup-code-list is-blocker">
            {blockers.slice(0, 4).map((item, index) => <li key={`${renderCodeItem(item)}-${index}`}>{renderCodeItem(item)}</li>)}
          </ul>
        ) : <p className="setup-empty-state">Chưa có blocker.</p>}
        {warnings.length ? (
          <ul className="setup-code-list is-warning">
            {warnings.slice(0, 4).map((item, index) => <li key={`${renderCodeItem(item)}-${index}`}>{renderCodeItem(item)}</li>)}
          </ul>
        ) : <p className="setup-empty-state">Chưa có cảnh báo.</p>}
      </section>
    </aside>
  );
}
