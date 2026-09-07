'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { getRegistrationStatus, getPairInviteContext, sendPairInvite, respondPairInvite } from '@/lib/tournamentV2Client';
import './../openreg.css';

const STATUS_LABEL = {
  awaiting_partner: 'Đang chờ ghép cặp',
  submitted: 'Chờ BTC duyệt',
  approved: 'Đã được duyệt',
  rejected: 'Bị từ chối',
  withdrawn: 'Đã rút',
  merged: 'Đã ghép cặp',
};

function TrackRegistrationInner() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') || '';

  const [token, setToken] = useState(initialToken);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [pairing, setPairing] = useState(null);
  const [pairBusy, setPairBusy] = useState('');
  const [pairMsg, setPairMsg] = useState('');

  const loadPairing = useCallback(async (tk) => {
    if (!tk) return;
    try {
      const data = await getPairInviteContext(tk);
      setPairing(data);
    } catch {
      setPairing(null);
    }
  }, []);

  const lookup = useCallback(async (query) => {
    setLoading(true);
    setError('');
    setResult(null);
    setPairing(null);
    setPairMsg('');
    try {
      const data = await getRegistrationStatus(query);
      setResult(data);
      const tk = data?.registration?.track_token || query.token || '';
      setActiveToken(tk);
      if (data?.registration?.status === 'awaiting_partner' && tk) await loadPairing(tk);
    } catch (err) {
      setError(err.message || 'Không tìm thấy đăng ký.');
    } finally {
      setLoading(false);
    }
  }, [loadPairing]);

  useEffect(() => {
    if (initialToken) lookup({ token: initialToken });
  }, [initialToken, lookup]);

  function handleTokenSubmit(e) {
    e.preventDefault();
    if (token.trim()) lookup({ token: token.trim() });
  }

  async function handleInvite(toId) {
    if (!activeToken) return;
    setPairBusy(`send:${toId}`);
    setPairMsg('');
    try {
      await sendPairInvite({ track_token: activeToken, to_registration_id: toId });
      setPairMsg('Đã gửi lời mời ghép cặp.');
      await loadPairing(activeToken);
    } catch (err) {
      setPairMsg(err.message || 'Không gửi được lời mời.');
    } finally {
      setPairBusy('');
    }
  }

  async function handleRespond(inviteId, action) {
    if (!activeToken) return;
    setPairBusy(`${action}:${inviteId}`);
    setPairMsg('');
    try {
      await respondPairInvite({ track_token: activeToken, invite_id: inviteId, action });
      setPairMsg(action === 'accept' ? 'Đã đồng ý ghép cặp. Chờ BTC duyệt.' : 'Đã từ chối lời mời.');
      await lookup({ token: activeToken });
    } catch (err) {
      setPairMsg(err.message || 'Không xử lý được lời mời.');
    } finally {
      setPairBusy('');
    }
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

      {reg && reg.status === 'awaiting_partner' && pairing ? (
        <div className="dk-card" style={{ marginTop: 16 }}>
          <h2 className="dk-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>Ghép cặp</h2>
          <p className="dk-subtitle" style={{ marginBottom: 12 }}>
            Bạn đang đăng ký một mình. Hãy rủ một VĐV lẻ khác, hoặc phản hồi lời mời gửi tới bạn.
          </p>

          {pairMsg ? <div className="dk-alert" style={{ marginBottom: 12 }}>{pairMsg}</div> : null}

          {(pairing.incoming || []).length ? (
            <div style={{ marginBottom: 16 }}>
              <h3 className="dk-label" style={{ marginBottom: 8 }}>Lời mời đến bạn</h3>
              {pairing.incoming.map((inv) => (
                <div className="dk-status-row" key={inv.invite_id} style={{ alignItems: 'center' }}>
                  <span>
                    {inv.name}
                    {inv.phr ? <span className="dk-subtitle"> · PHR {inv.phr}</span> : null}
                  </span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="dk-btn"
                      style={{ padding: '6px 12px', width: 'auto' }}
                      disabled={pairBusy === `accept:${inv.invite_id}`}
                      onClick={() => handleRespond(inv.invite_id, 'accept')}
                    >
                      Đồng ý
                    </button>
                    <button
                      type="button"
                      className="dk-btn dk-btn-secondary"
                      style={{ padding: '6px 12px', width: 'auto' }}
                      disabled={pairBusy === `decline:${inv.invite_id}`}
                      onClick={() => handleRespond(inv.invite_id, 'decline')}
                    >
                      Từ chối
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div>
            <h3 className="dk-label" style={{ marginBottom: 8 }}>VĐV lẻ có thể rủ ghép</h3>
            {(pairing.candidates || []).length ? (
              pairing.candidates.map((c) => (
                <div className="dk-status-row" key={c.registration_id} style={{ alignItems: 'center' }}>
                  <span>
                    {c.name}
                    {c.phr ? <span className="dk-subtitle"> · PHR {c.phr}</span> : null}
                  </span>
                  {c.invited ? (
                    <span className="dk-subtitle">Đã gửi lời mời</span>
                  ) : (
                    <button
                      type="button"
                      className="dk-btn"
                      style={{ padding: '6px 12px', width: 'auto' }}
                      disabled={pairBusy === `send:${c.registration_id}`}
                      onClick={() => handleInvite(c.registration_id)}
                    >
                      Rủ ghép
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="dk-subtitle">Chưa có VĐV lẻ nào khác trong nội dung này.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TrackRegistrationPage() {
  return (
    <Suspense fallback={<div className="dk-page"><p className="dk-subtitle">Đang tải…</p></div>}>
      <TrackRegistrationInner />
    </Suspense>
  );
}
