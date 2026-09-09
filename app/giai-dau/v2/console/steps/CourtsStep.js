'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCourtBoard, listCourts, listVenues, saveCourt, saveVenue, setCourtActive } from '@/lib/tournamentV2Client';

function formatClock(value) {
  if (!value) return '—';
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function CourtsStep({ tournamentId, isAdmin }) {
  const [board, setBoard] = useState(null);
  const [venues, setVenues] = useState([]);
  const [courts, setCourts] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [venueList, courtList, courtBoard] = await Promise.all([listVenues(tournamentId), listCourts(tournamentId), getCourtBoard(tournamentId)]);
      setVenues(venueList || []); setCourts(courtList || []); setBoard(courtBoard || null); setError('');
    } catch (loadError) { setError(loadError.message || 'Không tải được dữ liệu sân.'); }
  }, [tournamentId]);
  useEffect(() => { load(); }, [load]);
  async function addCourt() {
    setBusy(true);
    try {
      let venueId = venues[0]?.id;
      if (!venueId) venueId = (await saveVenue({ tournament_id: tournamentId, name: 'Địa điểm thi đấu' })).venue.id;
      await saveCourt({ tournament_id: tournamentId, venue_id: venueId, label: `Sân ${String(courts.length + 1).padStart(2, '0')}` });
      await load();
    } catch (saveError) { setError(saveError.message || 'Không thêm được sân.'); } finally { setBusy(false); }
  }
  async function toggle(court) {
    const active = !court.active;
    const reason = active ? '' : window.prompt(`Lý do ngưng dùng ${court.label}?`) || '';
    if (!active && !reason.trim()) return;
    setBusy(true);
    try { await setCourtActive({ tournament_id: tournamentId, id: court.id, active, reason }); await load(); }
    catch (toggleError) { setError(toggleError.message || 'Không đổi được trạng thái sân.'); }
    finally { setBusy(false); }
  }
  const activeCount = courts.filter((court) => court.active).length;
  const progress = board?.progress;
  return <div className="ops-block-list">
    {error ? <p className="ops-error">{error}</p> : null}
    <section className="ops-block"><h2>Số sân dành cho giải</h2><p className="ops-muted">Số sân quyết định giờ tan giải.</p><div className="ops-court-count"><b>{activeCount}</b> sân đang dùng / {courts.length} sân đã khai báo {isAdmin ? <button type="button" disabled={busy} onClick={addCourt}>+ Thêm sân</button> : null}</div>
      {progress ? <div className="ops-impact">Đang bố trí <b>{activeCount} sân</b> cho <b>{progress.total - progress.finalized} trận còn lại</b> → <b>ước tính hoàn tất {formatClock(progress.finish_at)}</b>.</div> : null}
    </section>
    <section className="ops-block"><h2>Danh sách sân</h2>{courts.length ? courts.map((court) => <div className="ops-court-row" key={court.id}><div><b>{court.label}</b><span>{court.surface || 'Chưa ghi mặt sân'}</span></div>{isAdmin ? <button type="button" className={`ops-toggle ${court.active ? '' : 'is-off'}`} disabled={busy} onClick={() => toggle(court)}>{court.active ? 'Đang dùng' : 'Ngưng dùng'}</button> : <span>{court.active ? 'Đang dùng' : 'Ngưng dùng'}</span>}</div>) : <p className="ops-muted">Chưa khai báo sân nào.</p>}</section>
    <section className="ops-block"><h2>Hàng đợi trận chờ</h2>{board?.queue?.length ? board.queue.map((item, index) => <div className="ops-queue-row" key={item.id}><span className="ops-queue-n">{index + 1}</span><span>Trận #{item.id}</span><span className="ops-queue-time">{item.locked_start ? `ghim ${formatClock(item.locked_start)}` : `dự kiến ${formatClock(item.projected_start)}`}</span></div>) : <p className="ops-muted">Không còn trận nào chờ.</p>}</section>
  </div>;
}