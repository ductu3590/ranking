'use client';

import { messageFor } from '@/lib/tournament/setupMessages';
import './friendly.css';

const SUBMITTED = ['roster_submitted', 'approved'];
const CLOSED = ['declined', 'withdrawn'];

// Scroll tới khu "CLB tham dự" sau khi về Bước 2 (khu render sau khi đổi bước).
export function goToClubs(onGoToStep) {
  onGoToStep?.(2);
  if (typeof window === 'undefined') return;
  let tries = 0;
  const seek = () => {
    const target = document.getElementById('fr-clubs');
    if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else if (tries++ < 20) requestAnimationFrame(seek);
  };
  requestAnimationFrame(seek);
}

function Item({ done, title, meta }) {
  return (
    <li className="fr-gate__item" data-done={done || undefined}>
      <span className="fr-gate__icon" aria-hidden="true">{done ? '✓' : '⏳'}</span>
      <span>
        <strong>{title}</strong>
        {meta ? <small>{meta}</small> : null}
      </span>
      <span className="pc-visually-hidden">{done ? 'Đã xong' : 'Đang chờ'}</span>
    </li>
  );
}

// Bước 4 của giải giao hữu khi chủ nhà đã xong phần mình nhưng CLB khách chưa gửi / chưa được duyệt (FRD-09, D52).
export default function FriendlyDrawGate({ draft, readiness, friendly, onGoToStep }) {
  const clubs = (friendly?.clubs || []).filter((club) => !CLOSED.includes(club.status));
  const clubBlockers = (readiness.byStep[3]?.blockers || []).filter((item) => item.field === 'clubs');
  return (
    <>
      <section className="pc-card pc-card--hero fr-gate">
        <p className="pc-eyebrow">Bước 4</p>
        <h2 className="pc-hero-title">Chưa bốc thăm được</h2>
        <p className="pc-lead">Bốc thăm mở khi CLB khách đã gửi danh sách cặp và bạn đã duyệt.</p>
        <ul className="fr-gate__list">
          <Item done title="Thông tin giải" meta={draft.tournament.name} />
          <Item done title="Cặp của CLB bạn" meta={`${draft.pairs.length} cặp`} />
          {clubs.length ? clubs.map((club) => (
            <li key={club.tournamentClubId} className="fr-gate__group">
              <ul>
                <Item done={SUBMITTED.includes(club.status)} title={`${club.name || 'CLB khách'} gửi danh sách`} meta={club.statusLabel} />
                <Item done={club.status === 'approved'} title={`Duyệt danh sách ${club.name || 'CLB khách'}`}
                  meta={club.status === 'approved' ? `${club.pairCount} cặp` : club.status === 'roster_submitted' ? 'Cần bạn duyệt' : null} />
              </ul>
            </li>
          )) : <Item done={false} title="Mời ít nhất một CLB khách" />}
        </ul>
        {clubBlockers.map((item) => (
          <div key={item.code} className="pc-notice pc-notice--warn" data-code={item.code}><p>{messageFor(item.code, item.params).text}</p></div>
        ))}
        <div className="pc-btn-row" style={{ marginTop: '1rem' }}>
          <button type="button" className="pc-btn pc-btn--primary" onClick={() => goToClubs(onGoToStep)}>‹ Về Bước 2 · CLB tham dự</button>
        </div>
      </section>
    </>
  );
}
