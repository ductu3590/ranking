'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getRegistrationStatus } from '@/lib/tournamentV2Client';
import './../openreg.css';

const STATUS_LABEL = {
  awaiting_partner: 'Đang chờ ghép cặp',
  submitted: 'Chờ BTC duyệt',
  approved: 'Đã được duyệt',
  rejected: 'Bị từ chối',
  withdrawn: 'Đã rút',
  merged: 'Đã ghép cặp',
};

export default function TrackRegistrationPage() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') || '';

  const [token, setToken] = useState(initialToken);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function lookup(query) {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await getRegistrationStatus(query);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Không tìm thấy đăng ký.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialToken) lookup({ token: initialToken });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  function handleTokenSubmit(e) {
    e.preventDefault();
    if (token.trim()) lookup({ token: token.trim() });
  }

  const reg = result?.registration;

  return (
    <div className="dk-page">
      <header className="dk-head">
        <h1 className="dk-title">Theo dõi đăng ký</h1>
        <p className="dk-subtitle">Nhập mã tra cứu để xem trạng thái đăng ký của bạn.</p>
      </header>

      <form onSubmit={handleTokenSubmit}>
        <div className="dk-field">
          <label className="dk-label">Mã tra cứu (token)</label>
          <input className="dk-input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Dán mã tra cứu ở đây" />
        </div>
        <button type="submit" className="dk-btn" disabled={loading}>
          {loading ? 'Đang tra cứu...' : 'Tra cứu'}
        </button>
      </form>

      {error ? <div className="dk-alert error" style={{ marginTop: 16 }}>{error}</div> : null}

      {reg ? (
        <div className="dk-card" style={{ marginTop: 16 }}>
          <div className="dk-status-row">
            <span>Trạng thái</span>
            <strong>{STATUS_LABEL[reg.status] || reg.status}</strong>
          </div>
          {result.waitlist_position ? (
            <div className="dk-status-row">
              <span>Vị trí chờ</span>
              <strong>#{result.waitlist_position}</strong>
            </div>
          ) : null}
          {(result.members || []).map((m) => (
            <div className="dk-status-row" key={m.seat}>
              <span>VĐV {m.seat}</span>
              <span>{m.full_name}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
