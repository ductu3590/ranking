'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { listFormats } from '@/lib/tournament/setupFormats';
import { messageFor } from '@/lib/tournament/setupMessages';
import { parseRef } from '@/lib/tournament/setupDraftV3';
import * as Pairing from '@/lib/tournament/pairingDraft';
import { newIdempotencyKey } from '@/lib/tournamentV2Client';
import GroupKnockoutConfig from './GroupKnockoutConfig';

const FORMAT_BLURB = {
  group_knockout: 'Chia bảng đấu vòng tròn, các cặp dẫn đầu vào vòng loại trực tiếp.',
  round_robin: 'Mọi cặp gặp nhau một lần, xếp hạng theo bảng điểm.',
  knockout: 'Thua một trận là dừng, phù hợp giải đông cặp cần xong nhanh.',
};

const makePairId = () => `pair_${newIdempotencyKey().replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`;

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '?').charAt(0).toUpperCase();
}

function useNames(draft, roster) {
  return useMemo(() => {
    const names = new Map();
    for (const row of roster || []) names.set(`member:${row.member_id}`, { name: row.full_name, guest: false });
    for (const guest of draft.participants.guests) names.set(`guest:${guest.clientRef}`, { name: guest.displayName || 'Khách mời', guest: true });
    return (ref) => names.get(ref) || { name: parseRef(ref)?.kind === 'guest' ? 'Khách mời' : 'Thành viên', guest: parseRef(ref)?.kind === 'guest' };
  }, [draft.participants.guests, roster]);
}

function FormatCards({ draft, onChange }) {
  const current = draft.format.formatKey;
  const choose = (format) => {
    if (!format.enabled) return;
    onChange((draftNow) => ({
      ...draftNow,
      format: { entrantType: 'doubles', formatKey: format.key, config: draftNow.format.formatKey === format.key ? draftNow.format.config : { ...format.defaultConfig } },
    }));
  };
  return (
    <div className="pc-format-grid" role="radiogroup" aria-label="Thể thức thi đấu">
      {listFormats().map((format) => (
        <button
          key={format.key} type="button" role="radio" className="pc-format"
          aria-label={format.enabled ? format.label : `${format.label} (sắp có)`}
          aria-checked={current === format.key} aria-disabled={!format.enabled || undefined}
          onClick={() => choose(format)}
        >
          <span className="pc-format__head">
            <span>{format.label}</span>
            {format.enabled ? <span className="pc-badge pc-badge--ok">Khả dụng</span> : <span className="pc-badge pc-badge--muted">Sắp có</span>}
          </span>
          <span className="pc-card__hint">{FORMAT_BLURB[format.key]}</span>
          <span className="pc-card__hint">Khuyến nghị {format.recommended[0]}–{format.recommended[1]} cặp</span>
        </button>
      ))}
    </div>
  );
}

function PairingBoard({ draft, roster, onChange, onAddPerson, stepResult, showErrors }) {
  const base = useId();
  const nameOf = useNames(draft, roster);
  const [selection, setSelection] = useState(Pairing.IDLE);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const board = { pairs: draft.pairs, unpairedRefs: draft.unpairedRefs };
  const phase = Pairing.selectionPhase(selection);

  useEffect(() => {
    setSelection((current) => Pairing.pruneSelection(current, { unpairedRefs: draft.unpairedRefs }));
  }, [draft.unpairedRefs]);

  const apply = (fn) => onChange((current) => ({ ...current, ...fn({ pairs: current.pairs, unpairedRefs: current.unpairedRefs }) }));
  const confirmPair = () => {
    if (phase !== 'ready') return;
    apply((state) => Pairing.createPair(state, selection.first, selection.second, makePairId));
    setSelection(Pairing.clearSelection());
  };
  const dropPerson = (ref) => {
    const parsed = parseRef(ref);
    onChange((current) => ({
      ...current,
      participants: parsed?.kind === 'guest'
        ? { ...current.participants, guests: current.participants.guests.filter((guest) => guest.clientRef !== parsed.clientRef) }
        : { ...current.participants, memberIds: current.participants.memberIds.filter((id) => id !== parsed?.id) },
    }));
  };
  const unpairedIssue = stepResult.blockers.find((item) => item.code === 'UNPAIRED_MEMBER');
  const odd = draft.unpairedRefs.length % 2 === 1;

  return (
    <div onKeyDown={(event) => { if (event.key === 'Escape') setSelection(Pairing.clearSelection()); }}>
      <div className="pc-toolbar">
        <button type="button" className="pc-btn pc-btn--soft" disabled={draft.unpairedRefs.length < 2}
          onClick={() => apply((state) => Pairing.pairRemainingRandomly(state, { random: Math.random, makeId: makePairId }))}>
          Ghép ngẫu nhiên phần còn lại
        </button>
        {confirmRegenerate ? (
          <span className="pc-btn-row" role="group" aria-label="Xác nhận ghép lại">
            <span className="pc-card__hint">Ghép lại mọi cặp chưa khóa?</span>
            <button type="button" className="pc-btn pc-btn--sm pc-btn--danger" onClick={() => {
              apply((state) => Pairing.regenerateUnlocked(state, { random: Math.random, makeId: makePairId }));
              setConfirmRegenerate(false);
            }}>Ghép lại</button>
            <button type="button" className="pc-btn pc-btn--sm" onClick={() => setConfirmRegenerate(false)}>Hủy</button>
          </span>
        ) : (
          <button type="button" className="pc-btn" disabled={!draft.pairs.some((pair) => !pair.locked)} onClick={() => setConfirmRegenerate(true)}>
            Ghép lại các cặp chưa khóa
          </button>
        )}
      </div>
      <div className="pc-notice pc-notice--info" style={{ marginBottom: '0.75rem' }}>
        <p>Chạm lần lượt hai người ở danh sách <strong>Chưa ghép</strong>, rồi bấm <strong>Ghép cặp</strong>. Chạm lại người đã chọn để hủy. Trên máy tính dùng Tab và Enter, Esc để bỏ chọn.</p>
      </div>

      {/* Thanh soạn cặp đặt TRÊN danh sách và dính đầu màn hình: chọn xong người thứ hai là thấy ngay nút Ghép cặp, kể cả trên điện thoại. */}
      <div className="pc-composer" aria-live="polite">
        <span className="pc-composer__slot" data-empty={!selection.first || undefined}>{selection.first ? nameOf(selection.first).name : 'Chọn người thứ nhất'}</span>
        <span aria-hidden="true">+</span>
        <span className="pc-composer__slot" data-empty={!selection.second || undefined}>{selection.second ? nameOf(selection.second).name : 'Chọn người thứ hai'}</span>
        <button type="button" className="pc-btn pc-btn--primary" disabled={phase !== 'ready'} onClick={confirmPair}>Ghép cặp</button>
      </div>
      <div className="pc-pairing">
        <div className="pc-pool">
          <h4 id={`${base}-pool`} style={{ margin: 0 }}>Chưa ghép ({draft.unpairedRefs.length})</h4>
          {draft.unpairedRefs.length ? (
            <ul className="pc-pool__list" aria-labelledby={`${base}-pool`}>
              {draft.unpairedRefs.map((ref) => {
                const person = nameOf(ref);
                const pressed = selection.first === ref || selection.second === ref;
                return (
                  <li key={ref}>
                    <button type="button" className="pc-chip-person" aria-pressed={pressed} onClick={() => setSelection((current) => Pairing.toggleSelection(current, ref))}>
                      <span className={`pc-avatar${person.guest ? ' pc-avatar--guest' : ''}`} aria-hidden="true">{initials(person.name)}</span>
                      <span className="pc-person__name">{person.name}{person.guest ? <span className="pc-person__meta"> · Khách</span> : null}</span>
                      <span className="pc-chip-person__tag">{selection.first === ref ? 'Người 1' : selection.second === ref ? 'Người 2' : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="pc-empty">Mọi người đã có cặp.</p>}
        </div>

        <div>
          <h4 style={{ margin: '0 0 0.5rem' }}>Các cặp ({draft.pairs.length})</h4>
          {draft.pairs.length ? (
            <ol className="pc-pairs">
              {draft.pairs.map((pair, index) => {
                const [a, b] = pair.participantRefs.map(nameOf);
                const label = `Cặp ${index + 1}: ${a.name} và ${b.name}`;
                return (
                  <li key={pair.pairId} className="pc-pair" data-locked={pair.locked || undefined}>
                    <span className="pc-pair__no">{String(index + 1).padStart(2, '0')}</span>
                    <span className="pc-pair__names"><span>{a.name}{a.guest ? ' (khách)' : ''}</span><span>{b.name}{b.guest ? ' (khách)' : ''}</span></span>
                    <span className="pc-pair__actions">
                      <button type="button" className="pc-icon-btn" aria-pressed={pair.locked} aria-label={`${pair.locked ? 'Mở khóa' : 'Khóa'} ${label}`}
                        onClick={() => apply((state) => Pairing.setLocked(state, pair.pairId, !pair.locked))}>{pair.locked ? '🔒' : '🔓'}</button>
                      <button type="button" className="pc-icon-btn" disabled={pair.locked} aria-label={`Tách ${label}`}
                        onClick={() => apply((state) => Pairing.splitPair(state, pair.pairId))}>✕</button>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : <p className="pc-empty">Chưa có cặp nào.</p>}
        </div>
      </div>

      {unpairedIssue && (showErrors || odd) ? (
        <div className="pc-notice pc-notice--warn" role="status" data-code="UNPAIRED_MEMBER" style={{ marginTop: '1rem', flexDirection: 'column' }}>
          <p>{messageFor('UNPAIRED_MEMBER', unpairedIssue.params).text}</p>
          {odd ? (
            <div className="pc-btn-row">
              <button type="button" className="pc-btn pc-btn--sm pc-btn--soft" onClick={onAddPerson}>Thêm 1 người</button>
              {draft.unpairedRefs.map((ref) => (
                <button key={ref} type="button" className="pc-btn pc-btn--sm" onClick={() => dropPerson(ref)}>Bỏ chọn {nameOf(ref).name}</button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function StepFormatPairing({ draft, roster, readiness, showErrors, onChange, onGoToStep }) {
  const base = useId();
  const stepResult = readiness.byStep[3];
  const formatIssue = stepResult.blockers.find((item) => item.field === 'format');
  const countIssue = stepResult.blockers.find((item) => item.code === 'PAIR_COUNT_BELOW_MINIMUM')
    || stepResult.warnings.find((item) => item.code === 'PAIR_COUNT_OUTSIDE_RECOMMENDED');
  const total = draft.participants.memberIds.length + draft.participants.guests.length;

  return (
    <>
      <section className="pc-card pc-card--hero" aria-labelledby={`${base}-title`}>
        <div className="pc-card__head">
          <div>
            <p className="pc-eyebrow">Thiết lập thi đấu</p>
            <h2 id={`${base}-title`} className="pc-hero-title">Thể thức &amp; ghép cặp</h2>
            <p className="pc-lead">Chọn thể thức rồi ghép {total} VĐV thành các cặp đánh đôi.</p>
          </div>
          <span className="pc-badge pc-badge--brand">{draft.pairs.length * 2}/{total} VĐV đã vào cặp</span>
        </div>
      </section>

      <section className="pc-card" aria-labelledby={`${base}-format`}>
        <div className="pc-card__head">
          <h3 id={`${base}-format`} className="pc-card__title"><span className="pc-section-key">A</span>Chọn thể thức thi đấu</h3>
        </div>
        <FormatCards draft={draft} onChange={onChange} />
        {formatIssue && showErrors ? (
          <p className="pc-field__error" role="alert" data-code={formatIssue.code} style={{ marginTop: '0.75rem' }}>{messageFor(formatIssue.code, formatIssue.params).text}</p>
        ) : null}
        {countIssue ? (
          <div className={`pc-notice ${countIssue.severity === 'blocker' ? 'pc-notice--error' : 'pc-notice--warn'}`} data-code={countIssue.code} style={{ marginTop: '0.75rem' }}>
            <p>{messageFor(countIssue.code, countIssue.params).text}</p>
          </div>
        ) : null}
      </section>

      {draft.format.formatKey === 'group_knockout' ? <GroupKnockoutConfig draft={draft} onChange={onChange} /> : null}

      <section className="pc-card" aria-labelledby={`${base}-pairs`}>
        <div className="pc-card__head">
          <h3 id={`${base}-pairs`} className="pc-card__title"><span className="pc-section-key">{draft.format.formatKey === 'group_knockout' ? 'D' : 'B'}</span>Bảng ghép cặp thi đấu</h3>
          <span className="pc-card__hint">Không có danh sách dự bị</span>
        </div>
        <PairingBoard draft={draft} roster={roster} onChange={onChange} stepResult={stepResult} showErrors={showErrors} onAddPerson={() => onGoToStep(2)} />
      </section>
    </>
  );
}
