'use client';

import { messageFor } from '@/lib/tournament/setupMessages';
import ClubChip from '../../console/friendly/ClubChip';
import { goToClubs } from './FriendlyDrawGate';
import './friendly.css';

const CLOSED = ['declined', 'withdrawn'];

// Tổng cặp hiệu lực của giải giao hữu (FRD-03): "7 cặp (4 của bạn + 3 của CLB khách)".
export function pairTotalText(hostCount, friendly) {
  const guestPairs = friendly?.approvedPairs || [];
  const guestClubs = [...new Set(guestPairs.map((pair) => String(pair.tournamentClubId)))];
  const guestLabel = guestClubs.length === 1 ? (guestPairs[0].clubName || 'CLB khách') : 'CLB khách';
  return `${hostCount + guestPairs.length} cặp (${hostCount} của bạn + ${guestPairs.length} của ${guestLabel})`;
}

// Nhóm "Cặp CLB khách" ở Bước 3 (Stitch FRD-03 step3 + FRD-09 placeholder): chỉ đọc — không ghép/tách/khoá.
// Chỉ cặp của CLB đã được duyệt; CLB chưa duyệt hiện dòng chờ, kèm nút về khu CLB tham dự.
export default function FriendlyGuestPairs({ friendly, hostPairCount, clubBlockers = [], onGoToStep }) {
  const clubs = (friendly?.clubs || []).filter((club) => !CLOSED.includes(club.status));
  const pairs = friendly?.approvedPairs || [];
  const byClub = new Map();
  for (const pair of pairs) {
    const key = String(pair.tournamentClubId);
    if (!byClub.has(key)) byClub.set(key, []);
    byClub.get(key).push(pair);
  }
  return (
    <section className="pc-card fr-guest-pairs" aria-labelledby="fr-guest-pairs-title" data-section="guest-pairs">
      <div className="pc-card__head">
        <h3 id="fr-guest-pairs-title" className="pc-card__title">Cặp CLB khách</h3>
        <span className="pc-card__hint">Chỉ xem</span>
      </div>
      {clubBlockers.map((item) => (
        <div key={item.code} className="pc-notice pc-notice--warn" data-code={item.code} style={{ flexDirection: 'column' }}>
          <p>{messageFor(item.code, item.params).text}</p>
          <div className="pc-btn-row"><button type="button" className="pc-btn pc-btn--sm" onClick={() => goToClubs(onGoToStep)}>Tới danh sách CLB</button></div>
        </div>
      ))}
      {!clubs.length ? <p className="pc-empty">Chưa mời CLB khách nào.</p> : null}
      {clubs.map((club) => {
        const clubPairs = byClub.get(String(club.tournamentClubId)) || [];
        const approved = club.status === 'approved';
        return (
          <div key={club.tournamentClubId} className="fr-guest-club">
            <div className="fr-guest-club__head">
              <ClubChip name={club.name} color={club.color} />
              <span className={`fr-status`} data-tone={approved ? 'ok' : 'wait'}>{approved ? `${clubPairs.length} cặp · đã duyệt` : club.statusLabel}</span>
            </div>
            {approved && clubPairs.length ? (
              <ol className="fr-pair-list">
                {clubPairs.map((pair, index) => (
                  <li key={pair.pairId} className="fr-pair" style={club.color ? { '--fr-club': club.color } : undefined}>
                    <span className="fr-pair__no">Cặp {index + 1}</span>
                    <span className="fr-pair__names">{(pair.members || []).map((member) => member.name || 'Thành viên').join(' + ')}</span>
                    <span className="fr-pair__lock" aria-label="Chỉ xem">🔒</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="fr-guest-club__wait">Cặp của {club.name || 'CLB khách'} hiện ở đây sau khi bạn duyệt danh sách.</p>
            )}
          </div>
        );
      })}
      {pairs.length ? <p className="fr-guest-pairs__note">Cặp CLB khách chỉ xem, không ghép hay tách được.</p> : null}
      <div className="fr-total" aria-live="polite">
        <strong>{pairTotalText(hostPairCount, friendly)}</strong>
      </div>
    </section>
  );
}
