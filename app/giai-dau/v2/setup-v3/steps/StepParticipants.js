'use client';

import { useId, useMemo, useState } from 'react';
import { messageFor } from '@/lib/tournament/setupMessages';
import { newIdempotencyKey } from '@/lib/tournamentV2Client';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '?').charAt(0).toUpperCase();
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}

function newGuestRef() {
  return `g_${newIdempotencyKey().replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`;
}

function GuestRow({ guest, warning, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(guest.displayName);
  const inputId = useId();
  return (
    <div className="pc-guest-row" data-warning={warning ? 'true' : undefined}>
      <span className="pc-avatar pc-avatar--guest" aria-hidden="true">{initials(guest.displayName)}</span>
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <>
            <label className="pc-visually-hidden" htmlFor={inputId}>Tên khách mời</label>
            <input
              id={inputId} className="pc-input" value={value} maxLength={60} autoFocus
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { onRename(value); setEditing(false); }
                if (event.key === 'Escape') { setValue(guest.displayName); setEditing(false); }
              }}
            />
          </>
        ) : (
          <>
            <div className="pc-person__name">{guest.displayName || 'Chưa có tên'}</div>
            <div className="pc-person__meta">Khách mời · chỉ tồn tại trong giải này</div>
          </>
        )}
        {warning ? <div className="pc-field__help" data-code={warning.code}>{messageFor(warning.code, warning.params).text}</div> : null}
      </div>
      <div className="pc-btn-row">
        {editing
          ? <button type="button" className="pc-btn pc-btn--sm pc-btn--soft" onClick={() => { onRename(value); setEditing(false); }}>Lưu tên</button>
          : <button type="button" className="pc-btn pc-btn--sm" onClick={() => setEditing(true)}>Sửa tên</button>}
        <button type="button" className="pc-btn pc-btn--sm pc-btn--danger" onClick={onRemove}>Xóa</button>
      </div>
    </div>
  );
}

export default function StepParticipants({ draft, roster, rosterLoading, readiness, showErrors, onChange }) {
  const base = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [guestName, setGuestName] = useState('');
  const [guestError, setGuestError] = useState('');
  const selected = useMemo(() => new Set(draft.participants.memberIds), [draft.participants.memberIds]);
  const stepResult = readiness.byStep[2];

  const visible = useMemo(() => {
    const q = fold(query);
    return (roster || []).filter((row) => {
      if (filter === 'active' && row.is_active === false) return false;
      if (!q) return true;
      return fold(row.full_name).includes(q) || (row.aliases || []).some((alias) => fold(alias).includes(q));
    });
  }, [roster, query, filter]);
  const activeIds = useMemo(() => (roster || []).filter((row) => row.is_active !== false).map((row) => String(row.member_id)), [roster]);
  const visibleIds = visible.map((row) => String(row.member_id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const setMembers = (nextIds) => onChange((current) => ({
    ...current,
    participants: { ...current.participants, memberIds: [...new Set(nextIds)] },
  }));
  const toggleMember = (id) => setMembers(selected.has(id) ? [...selected].filter((item) => item !== id) : [...selected, id]);
  const toggleVisible = () => setMembers(allVisibleSelected
    ? [...selected].filter((id) => !visibleIds.includes(id))
    : [...selected, ...visibleIds]);

  const guests = draft.participants.guests;
  const setGuests = (next) => onChange((current) => ({ ...current, participants: { ...current.participants, guests: next } }));
  const addGuest = () => {
    const name = guestName.trim();
    if (name.length < 2 || name.length > 60) { setGuestError(messageFor('GUEST_NAME_INVALID').text); return; }
    setGuests([...guests, { clientRef: newGuestRef(), displayName: name }]);
    setGuestName('');
    setGuestError('');
  };
  const guestWarning = (clientRef) => stepResult.warnings.find((item) => item.params?.clientRef === clientRef)
    || (showErrors ? stepResult.blockers.find((item) => item.params?.clientRef === clientRef) : null);
  const memberBlockers = stepResult.blockers.filter((item) => item.field === 'participants' && (showErrors || item.code !== 'ROSTER_EMPTY'));
  const inactiveWarning = stepResult.warnings.find((item) => item.code === 'INACTIVE_MEMBER_SELECTED');
  const total = draft.participants.memberIds.length + guests.length;

  return (
    <>
      <section className="pc-card pc-card--hero" aria-labelledby={`${base}-title`}>
        <div className="pc-card__head">
          <div>
            <p className="pc-eyebrow">Quản lý VĐV thi đấu</p>
            <h2 id={`${base}-title`} className="pc-hero-title">Danh sách người tham gia</h2>
            <p className="pc-lead">Chọn thành viên CLB và thêm khách mời. Mọi người được chọn đều là VĐV thi đấu chính thức; không có danh sách dự bị.</p>
          </div>
          <span className="pc-badge pc-badge--brand" aria-live="polite">{total} VĐV đã chọn</span>
        </div>
      </section>

      <section className="pc-card" aria-labelledby={`${base}-roster`}>
        <div className="pc-card__head">
          <h3 id={`${base}-roster`} className="pc-card__title">1. Thành viên CLB <span className="pc-badge pc-badge--muted">{selected.size} đã chọn</span></h3>
          <div className="pc-segmented" role="group" aria-label="Lọc thành viên">
            <button type="button" aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>Đang hoạt động ({activeIds.length})</button>
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tất cả ({(roster || []).length})</button>
          </div>
        </div>
        <div className="pc-toolbar">
          <div className="pc-search">
            <label className="pc-visually-hidden" htmlFor={`${base}-search`}>Tìm thành viên</label>
            <input id={`${base}-search`} type="search" className="pc-input" placeholder="Tìm theo tên hoặc biệt danh" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <label className="pc-btn pc-btn--soft">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={!visibleIds.length} />
            Chọn tất cả đang hiển thị
          </label>
        </div>
        {memberBlockers.map((item) => (
          <div key={`${item.code}-${item.params?.memberId || ''}`} className="pc-notice pc-notice--error" role="alert" data-code={item.code} style={{ marginBottom: '0.75rem' }}>
            <p>{messageFor(item.code, item.params).text}</p>
          </div>
        ))}
        {inactiveWarning ? (
          <div className="pc-notice pc-notice--warn" data-code={inactiveWarning.code} style={{ marginBottom: '0.75rem' }}>
            <p>{messageFor(inactiveWarning.code, inactiveWarning.params).text}</p>
          </div>
        ) : null}
        {rosterLoading ? <p className="pc-empty">Đang tải danh sách thành viên…</p> : visible.length === 0 ? (
          <p className="pc-empty">{query ? 'Không có thành viên khớp từ khóa.' : 'CLB chưa có thành viên phù hợp bộ lọc.'}</p>
        ) : (
          <ul className="pc-roster" aria-label="Thành viên CLB">
            {visible.map((row) => {
              const id = String(row.member_id);
              const inputId = `${base}-m-${id}`;
              return (
                <li key={id}>
                  <label className="pc-person" htmlFor={inputId}>
                    <input id={inputId} type="checkbox" checked={selected.has(id)} onChange={() => toggleMember(id)} />
                    <span className="pc-avatar" aria-hidden="true">{initials(row.full_name)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="pc-person__name" style={{ display: 'block' }}>{row.full_name}</span>
                      <span className="pc-person__meta" style={{ display: 'block' }}>
                        {(row.aliases || []).length ? `Biệt danh: ${row.aliases.join(', ')} · ` : ''}
                        {row.is_active === false ? 'Ngừng hoạt động' : 'Đang hoạt động'}
                      </span>
                    </span>
                    {row.athlete_id == null ? <span className="pc-badge pc-badge--draft">Chưa có hồ sơ</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <div className="pc-roster__footer">
          <span aria-live="polite">Đang chọn {selected.size}/{(roster || []).length} thành viên</span>
          <div className="pc-btn-row">
            <button type="button" className="pc-btn pc-btn--sm pc-btn--soft" onClick={() => setMembers([...selected, ...activeIds])} disabled={!activeIds.length}>
              Chọn toàn bộ thành viên đang hoạt động
            </button>
            <button type="button" className="pc-btn pc-btn--sm pc-btn--ghost" onClick={() => setMembers([])} disabled={!selected.size}>Bỏ chọn tất cả</button>
          </div>
        </div>
      </section>

      <section className="pc-card" aria-labelledby={`${base}-guests`}>
        <div className="pc-card__head">
          <h3 id={`${base}-guests`} className="pc-card__title">2. Khách mời <span className="pc-badge pc-badge--muted">{guests.length} khách</span></h3>
          <span className="pc-card__hint">Khách chỉ tồn tại trong giải này, không tạo hồ sơ CLB</span>
        </div>
        <div className="pc-toolbar">
          <div className="pc-search">
            <label className="pc-visually-hidden" htmlFor={`${base}-guest`}>Tên khách mời</label>
            <input
              id={`${base}-guest`} className="pc-input" placeholder="Nhập tên khách mời" value={guestName} maxLength={60}
              aria-invalid={Boolean(guestError) || undefined}
              onChange={(event) => { setGuestName(event.target.value); setGuestError(''); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addGuest(); } }}
            />
          </div>
          <button type="button" className="pc-btn pc-btn--primary" onClick={addGuest}>Thêm khách mời</button>
        </div>
        {guestError ? <p className="pc-field__error" role="alert">{guestError}</p> : null}
        {guests.length ? (
          <div className="pc-guest-list">
            {guests.map((guest) => (
              <GuestRow
                key={guest.clientRef}
                guest={guest}
                warning={guestWarning(guest.clientRef)}
                onRename={(name) => setGuests(guests.map((item) => (item.clientRef === guest.clientRef ? { ...item, displayName: name.trim() } : item)))}
                onRemove={() => setGuests(guests.filter((item) => item.clientRef !== guest.clientRef))}
              />
            ))}
          </div>
        ) : <p className="pc-empty">Chưa có khách mời.</p>}
      </section>
    </>
  );
}
