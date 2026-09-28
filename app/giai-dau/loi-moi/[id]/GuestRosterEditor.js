'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import * as Roster from '@/lib/tournament/guestRosterDraft';
import { messageFor } from '@/lib/tournament/setupMessages';
import { newIdempotencyKey } from '@/lib/tournamentV2Client';
import { pairCounterText, personInitial } from '../../v2/setup-v3/friendly/friendlyUi';

const makePairId = () => `p${newIdempotencyKey().replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}`;

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}

function savedKeyOf(raw) {
  // Nháp shape cũ (còn người chưa ghép) → coi như chưa lưu, để "Gửi" ghi shape mới trước.
  return Roster.savedNeedsRewrite(raw) ? '__rewrite__' : Roster.rosterKey(Roster.fromSaved(raw));
}

// Đăng ký cặp của CLB khách — "ghép = chọn" (sau nghiệm thu F3; D38, D51). Cột trái: thành viên CLB chưa có cặp; chạm
// đúng 2 người → "Ghép cặp" → cặp sang cột phải. Cột phải: cặp đã ghép, "Tách" trả 2 người về cột trái. Chỉ thành viên
// CLB mình, không khách mời, không kéo-thả. Logic thuần ở lib/tournament/guestRosterDraft.js.
export default function GuestRosterEditor({ invitation, members, busy, onSave, onSubmit, onDirtyChange, payloadRef }) {
  const base = useId();
  const [state, setState] = useState(() => Roster.fromSaved(invitation.rosterDraft));
  const [savedKey, setSavedKey] = useState(() => savedKeyOf(invitation.rosterDraft));
  const [selection, setSelection] = useState([]);
  const [query, setQuery] = useState('');

  // Bản trên server đổi (lưu xong, tải bản mới nhất) → lấy lại làm gốc.
  useEffect(() => {
    setState(Roster.fromSaved(invitation.rosterDraft));
    setSavedKey(savedKeyOf(invitation.rosterDraft));
    setSelection([]);
  }, [invitation.version, invitation.rosterDraft]);

  const dirty = Roster.rosterKey(state) !== savedKey;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const quota = invitation.quota ?? null;
  const full = Roster.isFull(state, quota);
  const byId = useMemo(() => new Map((members || []).map((member) => [String(member.memberId), member])), [members]);
  const nameOf = (ref) => byId.get(String(ref).replace(/^member:/, ''))?.name || 'Thành viên';
  const paired = new Set(Roster.pairedMemberIds(state));
  const pool = (members || []).filter((member) => member.active && !paired.has(String(member.memberId))
    && (!query.trim() || fold(member.name).includes(fold(query))));
  const blockers = Roster.rosterBlockers(state, { quota, members });
  const over = quota != null && state.pairs.length > quota;
  const ready = selection.length === 2 && !full;

  // Đủ hạn mức → bỏ chọn dở dang.
  useEffect(() => { if (full) setSelection([]); }, [full]);

  const toggle = (member) => setSelection((current) => Roster.toggleSelect(current, member.memberId, { state, member, quota }));
  const confirmPair = () => {
    if (!ready) return;
    setState((current) => Roster.pairSelected(current, selection, { makeId: makePairId, quota }));
    setSelection([]);
  };
  const payload = () => Roster.toPayload(state);
  // Trang cha cần bản đang soạn cho "Lưu nháp rồi rời".
  if (payloadRef) payloadRef.current = payload;

  return (
    <>
      <div className="li-roster">
        <section className="li-card li-roster__col" aria-labelledby={`${base}-members`}>
          <div className="li-card__head">
            <h2 id={`${base}-members`}>Thành viên CLB</h2>
            <span className="li-muted">{pool.length} người chưa có cặp</span>
          </div>
          <p className="li-muted">Chạm đúng hai người rồi bấm Ghép cặp.</p>
          <div className="li-composer" aria-live="polite">
            <span className="li-composer__names">
              {full ? `Đã đủ ${state.pairs.length} cặp (tối đa)` : selection.length
                ? selection.map((id) => nameOf(id)).join(' + ') : 'Chưa chọn ai'}
            </span>
            <button type="button" className="li-btn li-btn--primary" disabled={!ready || busy} onClick={confirmPair}>Ghép cặp</button>
          </div>
          <label className="li-sr" htmlFor={`${base}-search`}>Tìm theo tên</label>
          <input id={`${base}-search`} type="search" className="li-input" placeholder="Tìm theo tên" value={query} onChange={(event) => setQuery(event.target.value)} />
          {!pool.length ? <p className="li-muted">{query ? 'Không có thành viên khớp tên này.' : 'Mọi thành viên đang hoạt động đã có cặp.'}</p> : null}
          <ul className="li-members" aria-label="Thành viên chưa có cặp">
            {pool.map((member) => {
              const id = String(member.memberId);
              const pressed = selection.includes(id);
              const selectable = Roster.canSelect(state, member, quota) && (pressed || selection.length < 2);
              return (
                <li key={id} data-disabled={!member.hasAthlete || undefined}>
                  <button type="button" className="li-member" aria-pressed={pressed} disabled={busy || (!pressed && !selectable)} onClick={() => toggle(member)}>
                    <span className="li-avatar" aria-hidden="true">{pressed ? '✓' : personInitial(member.name)}</span>
                    <span className="li-member__name">
                      {member.name}
                      {!member.hasAthlete ? <small>Chưa có hồ sơ thi đấu</small> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="li-card li-roster__col" aria-labelledby={`${base}-pairs`}>
          <div className="li-card__head">
            <h2 id={`${base}-pairs`}>Cặp đã ghép</h2>
            <span className="li-counter" data-over={over || undefined} data-full={(full && !over) || undefined} aria-live="polite">
              {full && !over ? `Đã đủ ${state.pairs.length} cặp (tối đa)` : pairCounterText(state.pairs.length, quota)}
            </span>
          </div>
          {over ? <div className="li-banner" data-tone="error" data-code="FRIENDLY_QUOTA_EXCEEDED"><p>{messageFor('FRIENDLY_QUOTA_EXCEEDED', { quota }).text} Tách bớt cặp trước khi gửi.</p></div> : null}
          {state.pairs.length ? (
            <ol className="li-pairs">
              {state.pairs.map((pair, index) => {
                const names = pair.participantRefs.map(nameOf);
                return (
                  <li key={pair.pairId} className="li-pair" data-over={quota != null && index >= quota ? 'true' : undefined}>
                    <span className="li-pair__text"><strong>Cặp {index + 1}</strong> · {names.join(' + ')}</span>
                    <button type="button" className="li-btn li-btn--danger li-btn--sm" disabled={busy} aria-label={`Tách cặp ${index + 1}: ${names.join(' và ')}`}
                      onClick={() => setState((current) => Roster.splitPair(current, pair.pairId))}>Tách</button>
                  </li>
                );
              })}
            </ol>
          ) : <p className="li-muted">Chưa có cặp nào. Chọn hai thành viên ở danh sách rồi bấm Ghép cặp.</p>}
        </section>
      </div>

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
