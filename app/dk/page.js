'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listCommunityTournaments } from '@/lib/tournamentV2Client';
import './openreg.css';

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(value);
  }
}

export default function CommunityTournamentsPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await listCommunityTournaments();
        if (active) setTournaments(Array.isArray(list) ? list : []);
      } catch (err) {
        if (active) setError(err.message || 'Không tải được danh sách giải.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="dk-page">
      <header className="dk-head">
        <h1 className="dk-title">Giải đấu cộng đồng đang mở đăng ký</h1>
        <p className="dk-subtitle">Chọn giải và nội dung phù hợp để đăng ký tham gia.</p>
      </header>

      {loading ? (
        <div className="dk-state">Đang tải danh sách giải...</div>
      ) : error ? (
        <div className="dk-alert error">{error}</div>
      ) : tournaments.length === 0 ? (
        <div className="dk-state">Hiện chưa có giải nào mở đăng ký.</div>
      ) : (
        tournaments.map((t) => (
          <div className="dk-card" key={t.id}>
            <h2 className="dk-card-title">{t.name}</h2>
            <div className="dk-meta">
              {t.location ? <span>📍 {t.location}</span> : null}
              {t.event_date ? <span>🗓️ {formatDate(t.event_date)}</span> : null}
            </div>
            <div className="dk-div-list">
              {(t.divisions || []).map((d) => (
                <Link
                  key={d.id}
                  className="dk-div-item"
                  href={`/dk/${t.public_slug}/${d.id}`}
                >
                  <span>{d.name}</span>
                  <span className="dk-badge">Đang mở</span>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Link className="dk-btn-secondary dk-btn" href="/dk/theo-doi" style={{ display: 'inline-block', width: 'auto', padding: '10px 20px' }}>
          Tra cứu đăng ký của tôi
        </Link>
      </div>
    </div>
  );
}
