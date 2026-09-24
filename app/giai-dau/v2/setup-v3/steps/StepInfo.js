'use client';

import { useId } from 'react';
import { messageFor } from '@/lib/tournament/setupMessages';

function fieldIssue(stepResult, field) {
  return stepResult.blockers.find((item) => item.field === field) || stepResult.warnings.find((item) => item.field === field) || null;
}

function Field({ label, required, hint, issue, children, id, aside }) {
  return (
    <div className="pc-field">
      <label className="pc-field__label" htmlFor={id}>
        <span>{label}{required ? <span className="pc-req" aria-hidden="true"> *</span> : null}</span>
        {aside ? <small>{aside}</small> : null}
      </label>
      {children}
      {issue ? (
        <span id={`${id}-issue`} className={issue.severity === 'blocker' ? 'pc-field__error' : 'pc-field__help'} data-code={issue.code}>
          {messageFor(issue.code, issue.params).text}
        </span>
      ) : hint ? <span className="pc-field__help">{hint}</span> : null}
    </div>
  );
}

function weekdayLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function StepInfo({ draft, readiness, showErrors, onChange }) {
  const base = useId();
  const t = draft.tournament;
  const stepResult = readiness.byStep[1];
  const issueFor = (field) => {
    const found = fieldIssue(stepResult, field);
    if (!found) return null;
    return found.severity === 'blocker' && !showErrors ? null : found;
  };
  const set = (patch) => onChange((current) => ({ ...current, tournament: { ...current.tournament, ...patch } }));
  // Số sân chọn ở Bước 3, sau khi ghép cặp (biết số cặp mới gợi ý được số sân).
  const requiredDone = [t.name.trim(), t.eventDate, t.startTime].filter(Boolean).length;
  const posterOk = /^https:\/\/\S+$/i.test(t.posterUrl || '');

  return (
    <>
      <section className="pc-card pc-card--hero" aria-labelledby={`${base}-title`}>
        <div className="pc-card__head">
          <div>
            <p className="pc-eyebrow">Thiết lập cốt lõi</p>
            <h2 id={`${base}-title`} className="pc-hero-title">Thông tin giải đấu</h2>
            <p className="pc-lead">Ngày giờ dùng để ước tính lịch thi đấu ở Bước 4. Số sân chọn ở Bước 3, sau khi ghép cặp.</p>
          </div>
          <span className="pc-badge pc-badge--brand">{requiredDone}/3 mục bắt buộc</span>
        </div>
      </section>

      <section className="pc-card" aria-labelledby={`${base}-core`}>
        <div className="pc-card__head">
          <h3 id={`${base}-core`} className="pc-card__title">1. Tên &amp; thời gian thi đấu</h3>
          <span className="pc-card__hint">Trường có * là bắt buộc</span>
        </div>
        <div className="pc-grid">
          <Field id={`${base}-name`} label="Tên giải đấu" required issue={issueFor('name')}>
            <input
              id={`${base}-name`} className="pc-input" value={t.name} maxLength={120}
              placeholder="Ví dụ: Giải nội bộ tháng 10"
              aria-invalid={Boolean(issueFor('name')) || undefined}
              aria-describedby={issueFor('name') ? `${base}-name-issue` : undefined}
              onChange={(event) => set({ name: event.target.value })}
            />
          </Field>
          <div className="pc-grid pc-grid--2">
            <Field id={`${base}-date`} label="Ngày thi đấu" required issue={issueFor('eventDate')} hint={weekdayLabel(t.eventDate)}>
              <input
                id={`${base}-date`} type="date" className="pc-input" value={t.eventDate}
                aria-invalid={Boolean(issueFor('eventDate')) || undefined}
                aria-describedby={issueFor('eventDate') ? `${base}-date-issue` : undefined}
                onChange={(event) => set({ eventDate: event.target.value })}
              />
            </Field>
            <Field id={`${base}-time`} label="Giờ bắt đầu" required issue={issueFor('startTime')}>
              <input
                id={`${base}-time`} type="time" className="pc-input" value={t.startTime}
                aria-invalid={Boolean(issueFor('startTime')) || undefined}
                aria-describedby={issueFor('startTime') ? `${base}-time-issue` : undefined}
                onChange={(event) => set({ startTime: event.target.value })}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="pc-card" aria-labelledby={`${base}-extra`}>
        <div className="pc-card__head">
          <h3 id={`${base}-extra`} className="pc-card__title">2. Thông tin bổ sung &amp; áp phích</h3>
          <span className="pc-card__hint">Tùy chọn, có thể bổ sung sau</span>
        </div>
        <div className="pc-grid">
          <Field id={`${base}-location`} label="Địa điểm thi đấu" aside="Không bắt buộc">
            <input id={`${base}-location`} className="pc-input" value={t.location} maxLength={200} placeholder="Ví dụ: Cụm sân CLB" onChange={(event) => set({ location: event.target.value })} />
          </Field>
          <Field id={`${base}-desc`} label="Mô tả / thể lệ" aside="Không bắt buộc">
            <textarea id={`${base}-desc`} className="pc-textarea" value={t.description} maxLength={2000} onChange={(event) => set({ description: event.target.value })} />
          </Field>
          <Field id={`${base}-poster`} label="Áp phích (đường dẫn ảnh)" aside="Không bắt buộc" issue={issueFor('posterUrl')} hint="Dán đường dẫn ảnh bắt đầu bằng https://">
            <input
              id={`${base}-poster`} type="url" className="pc-input" value={t.posterUrl} placeholder="https://…"
              aria-invalid={Boolean(issueFor('posterUrl')) || undefined}
              onChange={(event) => set({ posterUrl: event.target.value })}
            />
          </Field>
          <div className="pc-poster" aria-live="polite">
            {posterOk
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={t.posterUrl} alt="Xem trước áp phích giải" referrerPolicy="no-referrer" />
              : <span>Chưa có áp phích. Dán đường dẫn ảnh để xem trước.</span>}
          </div>
        </div>
      </section>
    </>
  );
}
