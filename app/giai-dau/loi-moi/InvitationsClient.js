'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { listFriendlyInvitations } from '@/lib/tournamentV2Client';
import { CLUB_COLORS } from '@/lib/tournament/friendlyStandings';
import ClubChip from '../v2/console/friendly/ClubChip';
import { errorText } from '../v2/setup-v3/friendly/friendlyUi';
import { deadlineLeft, eventLabel, groupInvitations } from './invitationGroups';
import { LiPage, LiStatus } from './liShared';

// Màu chủ nhà luôn là màu đầu của bảng màu CLB (friendlyStandings.clubPalette); khách không biết id CLB chủ nhà.
const HOST_COLOR = CLUB_COLORS[0];

function primaryAction(item) {
  const href = `/giai-dau/loi-moi/${encodeURIComponent(item.id)}`;
  if (item.finalized || !item.window?.open) return { href, label: 'Xem', tone: 'plain' };
  if (item.status === 'invited') return { href, label: 'Trả lời ›', tone: 'primary' };
  if (item.status === 'accepted') return { href, label: 'Đăng ký cặp', tone: 'outline' };
  if (item.status === 'changes_requested') return { href, label: 'Sửa danh sách', tone: 'primary' };
  return { href, label: 'Xem', tone: 'plain' };
}

function InvitationCard({ item }) {
  const action = primaryAction(item);
  const when = eventLabel(item.tournament);
  const left = item.window?.open && item.window?.deadline ? deadlineLeft(item.window.deadline) : '';
  return (
    <article className="li-card li-invite" data-status={item.status}>
      <div className="li-card__head">
        <div>
          <h3>{item.tournament?.name || 'Giải giao hữu'}</h3>
          <ClubChip name={item.hostClub?.name} color={HOST_COLOR} />
        </div>
        <LiStatus status={item.status} label={item.finalized ? 'Đã chốt' : item.statusLabel} />
      </div>
      <ul className="li-meta">
        {when || item.tournament?.location ? <li><span aria-hidden="true">📅</span>{[when, item.tournament?.location].filter(Boolean).join(' · ')}</li> : null}
        <li><span aria-hidden="true">👥</span>{item.quota != null ? `Hạn mức ${item.quota} cặp` : 'Không giới hạn cặp'} · đã gửi {item.pairCount ?? 0}</li>
        {left ? <li className="li-invite__deadline"><span aria-hidden="true">⏰</span>Hạn chót {left.toLowerCase()}</li> : null}
      </ul>
      <div className="li-row">
        {item.finalized && item.publicUrl ? <a className="li-btn li-btn--soft" href={item.publicUrl}>Xem trang giải ›</a> : null}
        <Link className={`li-btn ${action.tone === 'primary' ? 'li-btn--primary' : action.tone === 'outline' ? 'li-btn--soft' : ''}`} href={action.href}>{action.label}</Link>
      </div>
    </article>
  );
}

function Group({ title, items }) {
  if (!items.length) return null;
  return (
    <section className="li-group" aria-label={title}>
      <h2 className="li-group__title">{title} <span>{items.length}</span></h2>
      {items.map((item) => <InvitationCard key={item.id} item={item} />)}
    </section>
  );
}

// Hộp lời mời giải giao hữu của CLB khách (FRD-04; spec F3 §4.3).
export default function InvitationsClient() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await listFriendlyInvitations());
    } catch (loadError) {
      setError(errorText(loadError, 'Không tải được lời mời.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const groups = groupInvitations(items || []);

  return (
    <LiPage label="Lời mời giải giao hữu">
      <p className="li-crumb"><Link href="/giai-dau/v2">Giải đấu</Link> › Lời mời</p>
      <h1 className="li-title">Lời mời giải giao hữu</h1>
      <p className="li-lead">Lời mời từ CLB khác. Mỗi lời mời cũng hiện trong chuông thông báo.</p>
      {error ? (
        <div className="li-banner" data-tone="error" role="alert">
          <p>{error}</p>
          <button type="button" className="li-btn li-btn--sm" onClick={load}>Thử lại</button>
        </div>
      ) : null}
      {!items && !error ? <section className="li-card"><div className="li-skeleton" aria-hidden="true"><i /><i /><i /></div><p className="li-muted" role="status">Đang tải lời mời…</p></section> : null}
      {items && !items.length ? (
        <section className="li-card li-card--center">
          <span className="li-icon" aria-hidden="true">✉</span>
          <p className="li-muted">Chưa có lời mời nào. Khi CLB khác mời, lời mời sẽ hiện ở đây và trong chuông thông báo.</p>
        </section>
      ) : null}
      <Group title="Cần bạn xử lý" items={groups.need} />
      <Group title="Đang diễn ra" items={groups.active} />
      <Group title="Đã xong" items={groups.done} />
    </LiPage>
  );
}
