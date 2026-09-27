'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { hostClubAction, inviteFriendlyClub, listFriendlyClubs } from '@/lib/tournamentV2Client';
import ClubChip from '../../console/friendly/ClubChip';
import InviteClubSheet from './InviteClubSheet';
import InviteLinkDialog from './InviteLinkDialog';
import RegistrationWindowCard from './RegistrationWindowCard';
import ClubReviewSheet from './ClubReviewSheet';
import { StatusChip, clubInitial, errorText, timeLabel } from './friendlyUi';
import './friendly.css';

const ACTIVE = ['invited', 'accepted', 'roster_submitted', 'changes_requested', 'approved'];
const CLOSED = ['declined', 'withdrawn'];
// Trạng thái còn chờ CLB khách / chủ nhà trước khi bốc thăm — banner FRD-09 "tiếp tục chuẩn bị cặp".
const WAITING = ['invited', 'accepted', 'roster_submitted', 'changes_requested'];

function QuotaDialog({ club, busy, error, onCancel, onSave }) {
  const base = useId();
  const [value, setValue] = useState(club.quota ?? 4);
  const clamp = (next) => Math.max(1, Math.min(32, Number(next) || 1));
  return (
    <div className="pc-dialog-backdrop fr-layer" onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}>
      <div className="pc-dialog" role="dialog" aria-modal="true" aria-labelledby={`${base}-t`}>
        <h2 id={`${base}-t`}>Đổi hạn mức · {club.name}</h2>
        <div className="pc-counter" role="group" aria-label="Hạn mức cặp">
          <button type="button" aria-label="Bớt một cặp" disabled={value <= 1} onClick={() => setValue(clamp(value - 1))}>−</button>
          <input inputMode="numeric" aria-label="Hạn mức cặp" value={value} onChange={(event) => setValue(clamp(event.target.value.replace(/\D/g, '')))} />
          <button type="button" aria-label="Thêm một cặp" disabled={value >= 32} onClick={() => setValue(clamp(value + 1))}>+</button>
        </div>
        {error ? <p className="pc-field__error" role="alert">{error}</p> : null}
        <div className="pc-btn-row" style={{ marginTop: '1rem' }}>
          <button type="button" className="pc-btn" disabled={busy} onClick={onCancel}>Huỷ</button>
          <button type="button" className="pc-btn pc-btn--primary" disabled={busy} onClick={() => onSave(value)}>{busy ? 'Đang lưu…' : 'Lưu hạn mức'}</button>
        </div>
      </div>
    </div>
  );
}

function RemoveDialog({ club, busy, error, onCancel, onConfirm }) {
  return (
    <div className="pc-dialog-backdrop fr-layer" onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}>
      <div className="pc-dialog" role="alertdialog" aria-modal="true" aria-labelledby="fr-remove-title">
        <h2 id="fr-remove-title">Rút {club.name} khỏi giải?</h2>
        <p>Lời mời và link mời hết hiệu lực. CLB đã gửi cặp thì các cặp đó không còn trong giải. Có thể mời lại sau.</p>
        {error ? <p className="pc-field__error" role="alert">{error}</p> : null}
        <div className="pc-btn-row">
          <button type="button" className="pc-btn" disabled={busy} onClick={onCancel}>Huỷ</button>
          <button type="button" className="pc-btn pc-btn--danger" disabled={busy} onClick={onConfirm}>{busy ? 'Đang rút…' : 'Rút CLB'}</button>
        </div>
      </div>
    </div>
  );
}

function ClubCard({ club, color, limitReached, menuOpen, onMenu, onReview, onRotate, onQuota, onRemove, onReinvite, busy }) {
  const count = club.submitted?.pairCount ?? 0;
  const closed = CLOSED.includes(club.status);
  return (
    <li className="fr-club" data-status={club.status}>
      <div className="fr-club__row">
        <span className="fr-avatar" aria-hidden="true" style={color ? { '--fr-club': color } : undefined}>{clubInitial(club.name)}<i /></span>
        <div className="fr-club__main">
          <strong className="fr-club__name">{club.name || 'CLB khách'}</strong>
          <span className="fr-club__meta">
            <StatusChip status={club.status} label={club.statusLabel} />
            <span>{club.quota != null ? `Hạn mức ${club.quota} cặp` : 'Không giới hạn cặp'} · đã gửi {count}</span>
          </span>
          {club.hasInviteLink && club.inviteLinkIssuedAt && !closed ? <small className="fr-club__hint">Link mời tạo lúc {timeLabel(club.inviteLinkIssuedAt)}</small> : null}
          {club.status === 'changes_requested' && club.reviewNote ? <small className="fr-club__hint">Đã yêu cầu sửa: {club.reviewNote}</small> : null}
        </div>
        {!closed ? (
          <button type="button" className="fr-icon-btn" aria-label={`Thao tác với ${club.name}`} aria-expanded={menuOpen} onClick={onMenu}>⋯</button>
        ) : null}
      </div>
      {menuOpen ? (
        <ul className="fr-menu" role="menu">
          <li><button type="button" role="menuitem" disabled={busy} onClick={onRotate}>🔗 Lấy link mời mới</button></li>
          <li><button type="button" role="menuitem" disabled={busy} onClick={onQuota}>Đổi hạn mức</button></li>
          <li><button type="button" role="menuitem" className="fr-danger-text" disabled={busy} onClick={onRemove}>Rút CLB</button></li>
        </ul>
      ) : null}
      {club.status === 'roster_submitted' ? (
        <div className="fr-club__actions">
          <ClubChip name={club.name} color={color} />
          <button type="button" className="pc-btn pc-btn--sm pc-btn--primary" onClick={onReview}>Xem &amp; duyệt ›</button>
        </div>
      ) : null}
      {club.status === 'approved' || club.status === 'changes_requested' ? (
        <div className="fr-club__actions">
          <ClubChip name={club.name} color={color} />
          <button type="button" className="pc-btn pc-btn--sm" onClick={onReview}>Xem danh sách</button>
        </div>
      ) : null}
      {closed ? (
        <div className="fr-club__actions">
          <button type="button" className="pc-btn pc-btn--sm" disabled={busy || limitReached} onClick={onReinvite}>Mời lại</button>
        </div>
      ) : null}
    </li>
  );
}

// Khu "CLB tham dự" ở Bước 2 của giải giao hữu (Stitch FRD-01, FRD-09; spec F3 §3.2; D46, D51, D52).
// Nút "Mời CLB" khoá theo limit.reached của server (không so số cứng) và luôn hiện câu gói trả phí khi khoá.
export default function FriendlyClubsPanel({ tournamentId, hostClub, colors, selectedCount, onChanged }) {
  const base = useId();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [reviewId, setReviewId] = useState(null);
  const [quotaFor, setQuotaFor] = useState(null);
  const [removeFor, setRemoveFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(async () => {
    if (!tournamentId) return null;
    try {
      const next = await listFriendlyClubs(tournamentId);
      setData(next);
      setLoadError('');
      return next;
    } catch (fetchError) {
      setLoadError(errorText(fetchError, 'Không tải được danh sách CLB tham dự.'));
      return null;
    }
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async () => {
    const next = await load();
    onChanged?.();
    return next;
  }, [load, onChanged]);

  const guests = (data?.clubs || []).filter((club) => !club.isHost);
  const limit = data?.limit || null;
  const limitReached = Boolean(limit?.reached);
  const colorOf = (club) => (club ? (colors?.[String(club.id)] || null) : null);
  const reviewClub = reviewId != null ? guests.find((club) => String(club.id) === String(reviewId)) || null : null;
  const waiting = guests.some((club) => WAITING.includes(club.status));

  async function hostAction(club, action, extra = {}) {
    setBusy(true);
    setDialogError('');
    try {
      const result = await hostClubAction({ id: club.id, action, expectedVersion: club.version, ...extra });
      return { ok: true, result };
    } catch (actionError) {
      if (actionError?.code === 'FRIENDLY_CLUB_VERSION_CONFLICT') await refresh();
      const text = errorText(actionError);
      setDialogError(text);
      return { ok: false, error: text };
    } finally {
      setBusy(false);
    }
  }

  async function rotate(club) {
    setMenuFor(null);
    const outcome = await hostAction(club, 'rotate_link');
    if (outcome.ok) {
      setLink({ club: outcome.result.club || club, invitePath: outcome.result.invitePath, mode: 'rotated' });
      refresh();
    } else setNotice({ tone: 'error', text: outcome.error || 'Không tạo được link mới.' });
  }

  async function reinvite(club) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await inviteFriendlyClub({ tournamentId, clubId: club.clubId, quota: club.quota ?? null });
      setLink({ club: result.club || club, invitePath: result.invitePath, mode: 'invited' });
      refresh();
    } catch (inviteError) {
      setNotice({ tone: 'error', text: errorText(inviteError) });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveQuota(quota) {
    const outcome = await hostAction(quotaFor, 'set_quota', { quota });
    if (outcome.ok) {
      setQuotaFor(null);
      setNotice({ tone: 'ok', text: `Đã đổi hạn mức của ${quotaFor.name} thành ${quota} cặp.` });
      refresh();
    }
  }

  async function confirmRemove() {
    const outcome = await hostAction(removeFor, 'remove');
    if (outcome.ok) {
      setNotice({ tone: 'ok', text: `Đã rút ${removeFor.name} khỏi giải.` });
      setRemoveFor(null);
      setReviewId(null);
      refresh();
    }
  }

  return (
    <section id="fr-clubs" className="pc-card fr-panel" aria-labelledby={`${base}-title`} data-section="clubs">
      <div className="pc-card__head">
        <h3 id={`${base}-title`} className="pc-card__title">2. CLB tham dự</h3>
        {limit ? <span className="pc-badge pc-badge--muted">Đã mời {limit.used}/{limit.max} CLB khách</span> : null}
      </div>

      {loadError ? (
        <div className="pc-notice pc-notice--error" role="alert"><p>{loadError}</p><button type="button" className="pc-btn pc-btn--sm" onClick={load}>Thử lại</button></div>
      ) : null}
      {notice ? (
        <div className={`pc-notice ${notice.tone === 'error' ? 'pc-notice--error' : 'pc-notice--info'}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <p>{notice.text}</p>
          <button type="button" className="pc-btn pc-btn--sm pc-btn--ghost" onClick={() => setNotice(null)}>Đóng</button>
        </div>
      ) : null}
      {waiting ? (
        <div className="pc-notice pc-notice--info fr-wait-banner">
          <p>Bạn có thể tiếp tục chuẩn bị cặp của CLB mình trong lúc chờ.</p>
        </div>
      ) : null}

      <div className="fr-host">
        <ClubChip name={hostClub?.name || 'CLB của bạn'} color={hostClub?.color} />
        <span className="fr-host__meta">CLB của bạn · {selectedCount} người đã chọn</span>
        <span className="pc-badge pc-badge--brand">Chủ nhà</span>
      </div>

      {!data && !loadError ? <p className="pc-empty">Đang tải CLB tham dự…</p> : null}
      {data && !guests.length ? (
        <div className="fr-empty">
          <span aria-hidden="true">✉</span>
          <p>Chưa mời CLB nào. Mời một CLB để họ tự gửi danh sách cặp.</p>
        </div>
      ) : null}
      {guests.length ? (
        <ul className="fr-club-list">
          {guests.map((club) => (
            <ClubCard
              key={club.id} club={club} color={colorOf(club)} limitReached={limitReached} busy={busy}
              menuOpen={menuFor === club.id} onMenu={() => setMenuFor(menuFor === club.id ? null : club.id)}
              onReview={() => { setDialogError(''); setReviewId(club.id); }}
              onRotate={() => rotate(club)}
              onQuota={() => { setMenuFor(null); setDialogError(''); setQuotaFor(club); }}
              onRemove={() => { setMenuFor(null); setDialogError(''); setRemoveFor(club); }}
              onReinvite={() => reinvite(club)}
            />
          ))}
        </ul>
      ) : null}

      <button type="button" className={`pc-btn ${limitReached ? '' : 'pc-btn--primary'} fr-invite-btn`} disabled={!data || limitReached} aria-describedby={limitReached ? `${base}-limit` : undefined}
        onClick={() => { setNotice(null); setInviting(true); }}>
        {limitReached ? '🔒 Mời CLB' : '＋ Mời CLB'}
      </button>
      {limitReached ? (
        <p id={`${base}-limit`} className="fr-limit-hint" data-code="FRIENDLY_CLUB_LIMIT_REACHED">
          Tài khoản CLB thường mời được tối đa {limit.max} CLB khách cho mỗi giải. {limit.upgradeHint}
        </p>
      ) : null}

      {data?.window ? <RegistrationWindowCard tournamentId={tournamentId} window={data.window} onChanged={() => refresh()} /> : null}

      {inviting ? (
        <InviteClubSheet
          tournamentId={tournamentId}
          onClose={() => setInviting(false)}
          onInvited={(result) => { setInviting(false); setLink({ club: result.club, invitePath: result.invitePath, mode: 'invited' }); refresh(); }}
          onLimitReached={(text) => { setInviting(false); setNotice({ tone: 'error', text }); refresh(); }}
        />
      ) : null}
      {link ? <InviteLinkDialog club={link.club} invitePath={link.invitePath} mode={link.mode} onClose={() => setLink(null)} onRotated={() => refresh()} /> : null}
      {reviewClub ? (
        <ClubReviewSheet
          club={reviewClub} color={colorOf(reviewClub)}
          onClose={() => setReviewId(null)}
          onDone={(text) => { setReviewId(null); setNotice({ tone: 'ok', text }); refresh(); }}
          onReload={refresh}
          onQuota={(club) => { setDialogError(''); setQuotaFor(club); }}
          onRemove={(club) => { setDialogError(''); setRemoveFor(club); }}
        />
      ) : null}
      {quotaFor ? <QuotaDialog club={quotaFor} busy={busy} error={dialogError} onCancel={() => setQuotaFor(null)} onSave={saveQuota} /> : null}
      {removeFor ? <RemoveDialog club={removeFor} busy={busy} error={dialogError} onCancel={() => setRemoveFor(null)} onConfirm={confirmRemove} /> : null}
    </section>
  );
}
