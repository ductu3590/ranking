'use client';

import { useState } from 'react';
import './friendly.css';

// Sau khi chốt giải giao hữu (D50): giải tự có link xem không liệt kê — hiện link để chủ nhà gửi CLB khách.
export default function FinalizedLinkDialog({ publicUrl, onContinue }) {
  const [copied, setCopied] = useState(false);
  const url = publicUrl && typeof window !== 'undefined' ? `${window.location.origin}${publicUrl}` : publicUrl || '';
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="pc-dialog-backdrop fr-layer">
      <div className="pc-dialog fr-link-dialog" role="dialog" aria-modal="true" aria-labelledby="fr-final-title">
        <span className="fr-link-dialog__ok" aria-hidden="true">✓</span>
        <h2 id="fr-final-title">Đã chốt giải</h2>
        <p>Lịch thi đấu đã tạo. Giải có link xem không liệt kê để CLB khách theo dõi lịch và kết quả.</p>
        <div className="fr-link-box">
          <label className="pc-visually-hidden" htmlFor="fr-final-url">Link xem giải</label>
          <input id="fr-final-url" className="pc-input" value={url} readOnly onFocus={(event) => event.target.select()} />
          <button type="button" className={`pc-btn ${copied ? 'pc-btn--soft' : 'pc-btn--primary'}`} onClick={copy}>{copied ? '✓ Đã sao chép' : 'Sao chép link'}</button>
        </div>
        <div className="pc-btn-row fr-link-actions">
          <button type="button" className="pc-btn pc-btn--primary" onClick={onContinue}>Vào bàn điều hành ›</button>
        </div>
      </div>
    </div>
  );
}
