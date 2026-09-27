'use client';

import { useEffect, useRef, useState } from 'react';
import { hostClubAction } from '@/lib/tournamentV2Client';
import { errorText } from './friendlyUi';

// Dialog "Link mời" (Stitch FRD-01 link, spec F3 §3.2). Link chỉ nằm trong state của dialog: không ghi vào
// bộ nhớ trình duyệt, không đưa lên URL. Đóng dialog là mất — cần lại thì tạo link mới (link cũ hết hiệu lực).
export default function InviteLinkDialog({ club, invitePath, mode = 'invited', onClose, onRotated }) {
  const [path, setPath] = useState(invitePath);
  const [version, setVersion] = useState(club?.version);
  const [rotated, setRotated] = useState(mode === 'rotated');
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const url = path ? `${typeof window !== 'undefined' ? window.location.origin : ''}${path}` : '';

  useEffect(() => { inputRef.current?.focus?.(); }, []);

  async function copy() {
    setError('');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      inputRef.current?.select?.();
      setError('Không sao chép tự động được. Chạm giữ vào ô link để sao chép.');
    }
  }

  async function rotate() {
    setBusy(true);
    setError('');
    try {
      const result = await hostClubAction({ id: club.id, action: 'rotate_link', expectedVersion: version });
      setPath(result.invitePath || null);
      setVersion(result.club?.version ?? version);
      setRotated(true);
      setCopied(false);
      setConfirmRotate(false);
      onRotated?.(result.club);
    } catch (rotateError) {
      setError(errorText(rotateError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pc-dialog-backdrop fr-layer" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div className="pc-dialog fr-link-dialog" role="dialog" aria-modal="true" aria-labelledby="fr-link-title">
        <span className="fr-link-dialog__ok" aria-hidden="true">✓</span>
        <h2 id="fr-link-title">{rotated ? 'Link mời mới' : 'Đã gửi lời mời'}</h2>
        {rotated
          ? <p>Link cũ đã hết hiệu lực. Gửi link này cho <strong>{club?.name || 'CLB khách'}</strong> qua Zalo nếu cần.</p>
          : <p><strong>{club?.name || 'CLB khách'}</strong> đã nhận thông báo trong PickHub. Gửi thêm link này qua Zalo nếu cần.</p>}
        {url ? (
          <div className="fr-link-box">
            <label className="pc-visually-hidden" htmlFor="fr-link-input">Link mời</label>
            <input id="fr-link-input" ref={inputRef} className="pc-input" value={url} readOnly onFocus={(event) => event.target.select()} />
            <button type="button" className={`pc-btn ${copied ? 'pc-btn--soft' : 'pc-btn--primary'}`} onClick={copy}>
              {copied ? '✓ Đã sao chép' : 'Sao chép link'}
            </button>
          </div>
        ) : null}
        <div className="pc-notice pc-notice--info fr-link-note">
          <p>Link chỉ mở được khi đăng nhập đúng CLB được mời. Link chỉ hiện một lần — cần lại thì tạo link mới (link cũ hết hiệu lực).</p>
        </div>
        {error ? <p className="pc-field__error" role="alert">{error}</p> : null}
        {confirmRotate ? (
          <div className="pc-notice pc-notice--warn fr-confirm" role="alertdialog" aria-labelledby="fr-rotate-title">
            <p id="fr-rotate-title"><strong>Tạo link mới?</strong> Link cũ sẽ hết hiệu lực ngay.</p>
            <div className="pc-btn-row">
              <button type="button" className="pc-btn pc-btn--sm" disabled={busy} onClick={() => setConfirmRotate(false)}>Huỷ</button>
              <button type="button" className="pc-btn pc-btn--sm pc-btn--primary" disabled={busy} onClick={rotate}>{busy ? 'Đang tạo…' : 'Tạo link mới'}</button>
            </div>
          </div>
        ) : null}
        <div className="pc-btn-row fr-link-actions">
          {!confirmRotate ? <button type="button" className="pc-btn" onClick={() => setConfirmRotate(true)}>Tạo link mới</button> : null}
          <button type="button" className="pc-btn pc-btn--primary" onClick={onClose}>Xong</button>
        </div>
      </div>
    </div>
  );
}
