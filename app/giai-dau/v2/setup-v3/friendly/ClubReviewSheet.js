'use client';

import { useId, useState } from 'react';
import { hostClubAction } from '@/lib/tournamentV2Client';
import ClubChip from '../../console/friendly/ClubChip';
import { StatusChip, dateTimeLabel, errorText, pairCounterText } from './friendlyUi';

const NOTE_MIN = 2;
const NOTE_MAX = 300;

// Sheet duyệt danh sách cặp của một CLB khách (Stitch FRD-02, spec F3 §3.3). Chủ nhà chỉ Duyệt / Yêu cầu sửa (lý do bắt
// buộc) / Đổi hạn mức / Rút CLB — không sửa hộ (D38). Xung đột version → banner "Tải lại".
export default function ClubReviewSheet({ club, color, onClose, onDone, onReload, onQuota, onRemove }) {
  const base = useId();
  const [mode, setMode] = useState('view');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const submitted = club?.submitted || { pairCount: 0, pairs: [] };
  const count = submitted.pairCount ?? submitted.pairs.length;
  const over = club?.quota != null && count > club.quota;
  const status = club?.status;
  const canApprove = status === 'roster_submitted';
  const canRequest = status === 'roster_submitted' || status === 'approved';

  async function run(action, extra = {}) {
    setBusy(true);
    setError('');
    try {
      await hostClubAction({ id: club.id, action, expectedVersion: club.version, ...extra });
      onDone?.(action === 'approve' ? `Đã duyệt danh sách ${club.name || 'CLB khách'}.` : `Đã gửi yêu cầu sửa cho ${club.name || 'CLB khách'}.`);
    } catch (actionError) {
      if (actionError?.code === 'FRIENDLY_CLUB_VERSION_CONFLICT') setConflict(true);
      else setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    setBusy(true);
    try {
      await onReload?.();
      setConflict(false);
      setError('');
    } finally {
      setBusy(false);
    }
  }

  const trimmed = note.trim();
  return (
    <div className="fr-sheet-backdrop fr-layer" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div className="fr-sheet" role="dialog" aria-modal="true" aria-labelledby={`${base}-title`}>
        <span className="fr-sheet__grip" aria-hidden="true" />
        <header className="fr-sheet__head">
          <div>
            <ClubChip name={club?.name} color={color} />
            <h2 id={`${base}-title`}>{club?.name || 'CLB khách'}</h2>
            {club?.submittedAt ? <p>Gửi lúc {dateTimeLabel(club.submittedAt)}</p> : null}
          </div>
          <div className="fr-sheet__head-side">
            <StatusChip status={status} label={club?.statusLabel} />
            <button type="button" className="fr-icon-btn" aria-label="Đóng" onClick={onClose}>×</button>
          </div>
        </header>
        <div className="fr-sheet__body">
          {conflict ? (
            <div className="pc-notice pc-notice--warn" role="alert" data-code="FRIENDLY_CLUB_VERSION_CONFLICT">
              <p>CLB vừa cập nhật danh sách. Tải lại để xem bản mới nhất trước khi duyệt.</p>
              <button type="button" className="pc-btn pc-btn--sm" disabled={busy} onClick={reload}>↻ Tải lại</button>
            </div>
          ) : null}
          {status === 'approved' ? (
            <div className="fr-count" data-tone="ok">✓ Đã duyệt · {count} cặp</div>
          ) : (
            <div className="fr-count" data-tone={over ? 'err' : 'ok'}>{pairCounterText(count, club?.quota)}</div>
          )}
          {status === 'changes_requested' && club?.reviewNote ? (
            <div className="pc-notice pc-notice--warn"><p><strong>Đã yêu cầu sửa:</strong> {club.reviewNote}</p></div>
          ) : null}
          <p className="fr-sheet__label">{status === 'approved' ? 'Danh sách cặp đã duyệt' : 'Danh sách cặp CLB gửi'}</p>
          {submitted.pairs.length ? (
            <ol className="fr-pair-list">
              {submitted.pairs.map((pair, index) => (
                <li key={pair.pairId} className="fr-pair" style={color ? { '--fr-club': color } : undefined}>
                  <span className="fr-pair__no">Cặp {index + 1}</span>
                  <span className="fr-pair__names">{pair.members.map((member) => member.name || 'Thành viên').join(' + ')}</span>
                </li>
              ))}
            </ol>
          ) : <p className="pc-empty">CLB chưa gửi danh sách.</p>}
          {status === 'approved' ? (
            <div className="pc-notice pc-notice--warn"><p>Sẽ phải bốc thăm lại nếu đã bốc. Yêu cầu sửa sẽ đưa CLB về trạng thái Cần sửa.</p></div>
          ) : null}
          {mode === 'request' ? (
            <div className="fr-request">
              <label className="pc-field__label" htmlFor={`${base}-note`}>
                <span>Lý do <span className="pc-req">(bắt buộc)</span></span>
                <small>{note.length}/{NOTE_MAX}</small>
              </label>
              <textarea id={`${base}-note`} className="pc-textarea" value={note} maxLength={NOTE_MAX} autoFocus
                placeholder="Ví dụ: Đổi cặp 2 cho cân trình" onChange={(event) => setNote(event.target.value)} />
              <span className="pc-field__help">Từ 2 đến 300 ký tự. CLB khách sẽ thấy lý do này.</span>
            </div>
          ) : null}
          {error ? <p className="pc-field__error" role="alert">{error}</p> : null}
        </div>
        <footer className="fr-sheet__foot">
          {mode === 'request' ? (
            <>
              <button type="button" className="pc-btn pc-btn--primary" disabled={busy || trimmed.length < NOTE_MIN} onClick={() => run('request_changes', { note: trimmed })}>
                {busy ? 'Đang gửi…' : 'Gửi yêu cầu'}
              </button>
              <button type="button" className="pc-btn pc-btn--ghost" disabled={busy} onClick={() => { setMode('view'); setNote(''); }}>Huỷ</button>
            </>
          ) : (
            <>
              {canApprove ? (
                <button type="button" className="pc-btn pc-btn--primary" disabled={busy || conflict || over} onClick={() => run('approve')}>
                  {busy ? 'Đang duyệt…' : '✓ Duyệt'}
                </button>
              ) : null}
              <div className="fr-sheet__pair-actions">
                {canRequest ? <button type="button" className="pc-btn" disabled={busy} onClick={() => setMode('request')}>Yêu cầu sửa</button> : null}
                <button type="button" className="pc-btn" disabled={busy} onClick={() => onQuota?.(club)}>Đổi hạn mức</button>
              </div>
              {status !== 'roster_submitted' ? <button type="button" className="pc-btn pc-btn--ghost fr-danger-text" disabled={busy} onClick={() => onRemove?.(club)}>Rút CLB</button> : null}
              <p className="fr-sheet__hint">Chủ nhà không sửa hộ danh sách. Muốn thay đổi, gửi yêu cầu sửa cho CLB khách.</p>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
