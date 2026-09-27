'use client';

import { useEffect, useId, useState } from 'react';
import { inviteFriendlyClub, listAvailableTournamentClubs } from '@/lib/tournamentV2Client';
import { clubInitial, errorText } from './friendlyUi';

const QUOTA_MIN = 1;
const QUOTA_MAX = 32;
const NOTE_MAX = 500;
const ACTIVE = ['invited', 'accepted', 'roster_submitted', 'changes_requested', 'approved'];

// Sheet "Mời CLB" (Stitch FRD-01 sheet, spec F3 §3.2): danh sách mọi CLB PickHub (tìm theo tên), chọn một CLB →
// hạn mức cặp (mặc định 4, 1–32) + lời nhắn (≤ 500) → Gửi lời mời. CLB đang có lời mời còn hiệu lực không hiện
// (tài khoản thường không mở được sheet khi đã mời đủ — ADR-007 D46/D52).
export default function InviteClubSheet({ tournamentId, onClose, onInvited, onLimitReached }) {
  const base = useId();
  const [query, setQuery] = useState('');
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);
  const [quota, setQuota] = useState(4);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      listAvailableTournamentClubs({ tournamentId, q: query.trim() || undefined })
        .then((data) => {
          if (!alive) return;
          setClubs((data.clubs || []).filter((club) => !ACTIVE.includes(club.invitation?.status)));
          setLoadError('');
        })
        .catch((fetchError) => { if (alive) setLoadError(errorText(fetchError, 'Không tải được danh sách CLB.')); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [tournamentId, query]);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await inviteFriendlyClub({ tournamentId, clubId: selected.id, quota, invitationNote: note.trim() || null });
      onInvited?.(result);
    } catch (inviteError) {
      // Đua với tab khác đã mời đủ: đóng sheet, panel tải lại và hiện câu hạn mức (spec F3 §3.2).
      if (inviteError?.code === 'FRIENDLY_CLUB_LIMIT_REACHED') onLimitReached?.(errorText(inviteError));
      else setError(errorText(inviteError, 'Không gửi được lời mời. Thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  const setQuotaSafe = (value) => setQuota(Math.max(QUOTA_MIN, Math.min(QUOTA_MAX, Number(value) || QUOTA_MIN)));

  return (
    <div className="fr-sheet-backdrop fr-layer" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-labelledby={`${base}-title`}>
        <span className="fr-sheet__grip" aria-hidden="true" />
        <header className="fr-sheet__head">
          <div>
            <h2 id={`${base}-title`}>Mời CLB</h2>
            <p>CLB được mời sẽ nhận thông báo trong PickHub và tự gửi danh sách cặp.</p>
          </div>
          <button type="button" className="fr-icon-btn" aria-label="Đóng" onClick={onClose}>×</button>
        </header>
        <div className="fr-sheet__body">
          <label className="pc-visually-hidden" htmlFor={`${base}-q`}>Tìm CLB theo tên</label>
          <input id={`${base}-q`} type="search" className="pc-input" placeholder="Tìm CLB theo tên" value={query} maxLength={60}
            onChange={(event) => { setQuery(event.target.value); setSelected(null); }} />
          <div className="fr-sheet__meta"><span>Danh sách CLB</span>{!loading ? <span>{clubs.length} kết quả</span> : null}</div>
          {loadError ? <p className="pc-field__error" role="alert">{loadError}</p> : null}
          {loading && !clubs.length ? <p className="pc-empty">Đang tải danh sách CLB…</p> : null}
          {!loading && !loadError && !clubs.length ? <p className="pc-empty">{query ? 'Không có CLB khớp tên này.' : 'Chưa có CLB nào khác trên PickHub.'}</p> : null}
          <ul className="fr-club-pick" role="radiogroup" aria-label="Chọn CLB để mời">
            {clubs.map((club) => {
              const active = selected?.id === club.id;
              return (
                <li key={club.id} data-selected={active || undefined}>
                  <button type="button" role="radio" aria-checked={active} className="fr-club-pick__row" onClick={() => setSelected(active ? null : club)}>
                    <span className="fr-avatar" aria-hidden="true">{clubInitial(club.name)}</span>
                    <span className="fr-club-pick__name">
                      {club.name}
                      {active ? <small>Đang chọn để gửi lời mời</small> : club.invitation?.statusLabel ? <small>Trước đây: {club.invitation.statusLabel}</small> : null}
                    </span>
                    <span className="fr-radio" aria-hidden="true" />
                  </button>
                  {active ? (
                    <div className="fr-club-pick__form">
                      <div className="pc-field">
                        <span className="pc-field__label" id={`${base}-quota-label`}><span>Hạn mức cặp</span><small>Từ 1 đến 32 cặp</small></span>
                        <div className="pc-counter" role="group" aria-labelledby={`${base}-quota-label`}>
                          <button type="button" aria-label="Bớt một cặp" disabled={quota <= QUOTA_MIN} onClick={() => setQuotaSafe(quota - 1)}>−</button>
                          <input inputMode="numeric" aria-label="Hạn mức cặp" value={quota} onChange={(event) => setQuotaSafe(event.target.value.replace(/\D/g, ''))} />
                          <button type="button" aria-label="Thêm một cặp" disabled={quota >= QUOTA_MAX} onClick={() => setQuotaSafe(quota + 1)}>+</button>
                        </div>
                      </div>
                      <div className="pc-field">
                        <label className="pc-field__label" htmlFor={`${base}-note`}><span>Lời nhắn cho CLB (tùy chọn)</span><small>{note.length}/{NOTE_MAX}</small></label>
                        <textarea id={`${base}-note`} className="pc-textarea" maxLength={NOTE_MAX} value={note} placeholder="Ví dụ: Có mặt lúc 7:15 nhé"
                          onChange={(event) => setNote(event.target.value)} />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
        <footer className="fr-sheet__foot">
          {error ? <p className="pc-field__error" role="alert">{error}</p> : null}
          <button type="button" className="pc-btn pc-btn--primary" disabled={!selected || busy} onClick={submit}>{busy ? 'Đang gửi…' : 'Gửi lời mời'}</button>
          <button type="button" className="pc-btn pc-btn--ghost" onClick={onClose}>Huỷ</button>
        </footer>
      </div>
    </div>
  );
}
