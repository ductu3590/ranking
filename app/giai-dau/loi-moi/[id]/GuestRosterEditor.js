'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Pairing from '@/lib/tournament/pairingDraft';
import { normalizeClubRoster } from '@/lib/tournament/setupDraftV3';
import { messageFor } from '@/lib/tournament/setupMessages';
import { newIdempotencyKey } from '@/lib/tournamentV2Client';
import { pairCounterText, personInitial } from '../../v2/setup-v3/friendly/friendlyUi';

const makePairId = () => `p${newIdempotencyKey().replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}`;

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}

export function rosterKey(roster) {
  const normalized = normalizeClubRoster(roster);
  return JSON.stringify({ m: normalized.memberIds, p: normalized.pairs.map((pair) => [pair.pairId, ...pair.participantRefs]) });
}

// Kiểm trước khi gửi (server kiểm lại: validateClubRosterForSubmit). Lẻ người / vượt hạn mức vẫn LƯU NHÁP được.
export function rosterBlockers(roster, { quota, members }) {
  const byId = new Map((members || []).map((member) => [String(member.memberId), member]));
  const out = [];
  if (!roster.pairs.length) out.push({ code: 'FRIENDLY_ROSTER_EMPTY' });
  if (roster.unpairedRefs.length) out.push({ code: 'FRIENDLY_ROSTER_UNPAIRED', params: { count: roster.unpairedRefs.length } });
  if (quota != null && roster.pairs.length > quota) out.push({ code: 'FRIENDLY_QUOTA_EXCEEDED', params: { quota, count: roster.pairs.length } });
  for (const id of roster.memberIds) {
    const member = byId.get(String(id));
    if (!member || member.active !== true) out.push({ code: 'FRIENDLY_MEMBER_OUTSIDE_CLUB', params: { memberIds: [id] } });
    else if (member.hasAthlete !== true) out.push({ code: 'FRIENDLY_ATHLETE_ID_MISSING', params: { name: member.name, memberId: id } });
  }
  return out;
}

// Chọn thành viên + ghép cặp của CLB khách (Stitch FRD-06, spec F3 §4.4; D38, D51). Chỉ thành viên CLB mình —
// không có ô thêm người ngoài. Ghép cặp: chạm đúng hai người chưa ghép rồi bấm "Ghép cặp" (bất biến setup §3.3).
export default function GuestRosterEditor({ invitation, members, busy, onSave, onSubmit, onDirtyChange, payloadRef }) {
  const base = useId();
  const searchRef = useRef(null);
  const [roster, setRoster] = useState(() => normalizeClubRoster(invitation.rosterDraft));
  const [savedKey, setSavedKey] = useState(() => rosterKey(invitation.rosterDraft));
  const [selection, setSelection] = useState(Pairing.IDLE);
  const [query, setQuery] = useState('');

  // Bản trên server đổi (lưu xong, tải bản mới nhất) → lấy lại làm gốc.
  useEffect(() => {
    setRoster(normalizeClubRoster(invitation.rosterDraft));
    setSavedKey(rosterKey(invitation.rosterDraft));
    setSelection(Pairing.IDLE);
  }, [invitation.version, invitation.rosterDraft]);

  const dirty = rosterKey(roster) !== savedKey;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    setSelection((current) => Pairing.pruneSelection(current, { unpairedRefs: roster.unpairedRefs }));
  }, [roster.unpairedRefs]);

  const quota = invitation.quota ?? null;
  const byRef = useMemo(() => new Map((members || []).map((member) => [`member:${member.memberId}`, member])), [members]);
  const nameOf = (ref) => byRef.get(ref)?.name || 'Thành viên';
  const selected = new Set(roster.memberIds.map(String));
  const unpairedSet = new Set(roster.unpairedRefs);
  const visible = (members || []).filter((member) => (member.active || selected.has(String(member.memberId)))
    && (!query.trim() || fold(member.name).includes(fold(query))));
  const eligibleIds = (members || []).filter((member) => member.active && member.hasAthlete).map((member) => String(member.memberId));
  const phase = Pairing.selectionPhase(selection);
  const blockers = rosterBlockers(roster, { quota, members });
  const over = quota != null && roster.pairs.length > quota;
  const odd = roster.unpairedRefs.length % 2 === 1;

  const setMembers = (ids) => setRoster((current) => {
    const memberIds = [...new Set(ids.map(String))];
    const synced = Pairing.syncParticipants(current, memberIds.map((id) => `member:${id}`));
    return normalizeClubRoster({ memberIds, pairs: synced.pairs, unpairedRefs: synced.unpairedRefs });
  });
  const toggleMember = (id) => setMembers(selected.has(id) ? roster.memberIds.filter((item) => String(item) !== id) : [...roster.memberIds, id]);
  const apply = (fn) => setRoster((current) => normalizeClubRoster({ memberIds: current.memberIds, ...fn({ pairs: current.pairs, unpairedRefs: current.unpairedRefs }) }));
  const confirmPair = () => {
    if (phase !== 'ready') return;
    apply((state) => Pairing.createPair(state, selection.first, selection.second, makePairId));
    setSelection(Pairing.clearSelection());
  };
  const dropOdd = () => {
    const ref = roster.unpairedRefs[roster.unpairedRefs.length - 1];
    if (ref) setMembers(roster.memberIds.filter((id) => `member:${id}` !== ref));
  };
  const addOne = () => {
    searchRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    searchRef.current?.focus?.();
  };
  const payload = () => normalizeClubRoster(roster);
  // Trang cha cần bản đang soạn cho "Lưu nháp rồi rời".
  if (payloadRef) payloadRef.current = payload;

  return (
    <>
      <section className="li-card" aria-labelledby={`${base}-members`}>
        <div className="li-card__head">
          <h2 id={`${base}-members`}>Chọn thành viên <span className="li-status">{selected.size} đã chọn</span></h2>
          <button type="button" className="li-btn li-btn--ghost li-btn--sm" disabled={!eligibleIds.length || busy}
            onClick={() => setMembers([...roster.memberIds, ...eligibleIds])}>Chọn toàn bộ</button>
        </div>
        <label className="li-sr" htmlFor={`${base}-search`}>Tìm theo tên</label>
        <input id={`${base}-search`} ref={searchRef} type="search" className="li-input" placeholder="Tìm theo tên" value={query} onChange={(event) => setQuery(event.target.value)} />
        {!visible.length ? <p className="li-muted">{query ? 'Không có thành viên khớp tên này.' : 'CLB chưa có thành viên đang hoạt động.'}</p> : null}
        <ul className="li-members" aria-label="Thành viên CLB">
          {visible.map((member) => {
            const id = String(member.memberId);
            const ref = `member:${id}`;
            const disabled = !member.hasAthlete && !selected.has(id);
            const inputId = `${base}-m-${id}`;
            return (
              <li key={id} data-disabled={disabled || undefined}>
                <label htmlFor={inputId} className="li-member">
                  <span className="li-avatar" aria-hidden="true">{personInitial(member.name)}</span>
                  <span className="li-member__name">
                    {member.name}
                    {!member.hasAthlete ? <small>Chưa có hồ sơ thi đấu</small> : !member.active ? <small>Ngừng hoạt động</small> : null}
                  </span>
                  {selected.has(id) && unpairedSet.has(ref) ? <span className="li-tag">Chưa ghép</span> : null}
                  <input id={inputId} type="checkbox" checked={selected.has(id)} disabled={disabled || busy} onChange={() => toggleMember(id)} />
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="li-card" aria-labelledby={`${base}-pairs`} onKeyDown={(event) => { if (event.key === 'Escape') setSelection(Pairing.clearSelection()); }}>
        <div className="li-card__head">
          <h2 id={`${base}-pairs`}>Ghép cặp</h2>
          <span className="li-counter" data-over={over || undefined} aria-live="polite">{pairCounterText(roster.pairs.length, quota)}</span>
        </div>
        <p className="li-muted">Chạm đúng hai người rồi bấm Ghép cặp.</p>
        {over ? <div className="li-banner" data-tone="error" data-code="FRIENDLY_QUOTA_EXCEEDED"><p>{messageFor('FRIENDLY_QUOTA_EXCEEDED', { quota }).text} Tách bớt cặp trước khi gửi.</p></div> : null}
        <div className="li-pool">
          <p className="li-pool__title">Người chưa ghép ({roster.unpairedRefs.length} người)</p>
          {roster.unpairedRefs.length ? (
            <ul className="li-chips" aria-label="Người chưa ghép">
              {roster.unpairedRefs.map((ref) => {
                const pressed = selection.first === ref || selection.second === ref;
                return (
                  <li key={ref}>
                    <button type="button" className="li-chip" aria-pressed={pressed} disabled={busy}
                      onClick={() => setSelection((current) => Pairing.toggleSelection(current, ref))}>
                      {pressed ? '✓ ' : ''}{nameOf(ref)}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="li-muted">{roster.memberIds.length ? 'Mọi người đã có cặp.' : 'Chọn thành viên ở trên để ghép cặp.'}</p>}
          <button type="button" className="li-btn li-btn--primary li-btn--block" disabled={phase !== 'ready' || busy} onClick={confirmPair}>Ghép cặp</button>
        </div>
        {roster.pairs.length ? (
          <>
            <p className="li-pool__title">Danh sách cặp đã ghép</p>
            <ol className="li-pairs">
              {roster.pairs.map((pair, index) => {
                const names = pair.participantRefs.map(nameOf);
                return (
                  <li key={pair.pairId} className="li-pair" data-over={quota != null && index >= quota ? 'true' : undefined}>
                    <span className="li-pair__text"><strong>Cặp {index + 1}</strong> · {names.join(' + ')}</span>
                    <button type="button" className="li-btn li-btn--danger li-btn--sm" disabled={busy} aria-label={`Tách cặp ${index + 1}: ${names.join(' và ')}`}
                      onClick={() => apply((state) => Pairing.splitPair(state, pair.pairId))}>Tách</button>
                  </li>
                );
              })}
            </ol>
          </>
        ) : null}
      </section>

      {odd ? (
        <section className="li-banner" data-tone="warn" data-code="FRIENDLY_ROSTER_UNPAIRED">
          <p><strong>Còn {roster.unpairedRefs.length} người chưa có cặp: {roster.unpairedRefs.map(nameOf).join(', ')}</strong></p>
          <p>Giải chỉ nhận cặp đôi. Chọn thêm một người hoặc bỏ người lẻ để gửi được.</p>
          <div className="li-row">
            <button type="button" className="li-btn li-btn--soft" disabled={busy} onClick={addOne}>Chọn thêm một người</button>
            <button type="button" className="li-btn" disabled={busy} onClick={dropOdd}>Bỏ chọn người lẻ</button>
          </div>
        </section>
      ) : null}

      <div className="li-actionbar">
        <p className="li-actionbar__status" aria-live="polite">
          {dirty ? <><i data-tone="warn" aria-hidden="true" />Chưa lưu thay đổi</> : <><i data-tone="ok" aria-hidden="true" />Đã lưu</>}
        </p>
        <div className="li-row">
          <button type="button" className="li-btn" disabled={!dirty || busy} onClick={() => onSave(payload())}>Lưu nháp</button>
          <button type="button" className="li-btn li-btn--primary" disabled={blockers.length > 0 || busy} onClick={() => onSubmit(payload(), dirty)}>Gửi danh sách</button>
        </div>
        {blockers.length ? (
          <p className="li-actionbar__hint" data-code={blockers[0].code}>{messageFor(blockers[0].code, blockers[0].params).text}</p>
        ) : null}
      </div>
    </>
  );
}
