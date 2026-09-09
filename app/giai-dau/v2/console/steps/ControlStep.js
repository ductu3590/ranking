'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCourtBoard, transitionMatch } from '@/lib/tournamentV2Client';
import { matchElapsed } from '@/lib/tournament/matchLifecycle';

function formatClock(value) { if (!value) return '—'; const date = new Date(value); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }

export default function ControlStep({ tournamentId }) {
  const [board, setBoard] = useState(null); const [now, setNow] = useState(() => Date.now()); const [call, setCall] = useState(null); const [error, setError] = useState('');
  const load = useCallback(async () => { try { setBoard(await getCourtBoard(tournamentId)); setError(''); } catch (loadError) { setError(loadError.message || 'Không tải được bảng sân.'); } }, [tournamentId]);
  useEffect(() => { load(); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [tournamentId]);
  async function move(match, to, courtId) {
    try { await transitionMatch({ match_id: match.id, to, court_id: courtId, expected_version: match.version }); setCall(null); await load(); }
    catch (moveError) { setError(moveError.code === 'MATCH_VERSION_CONFLICT' ? 'Trận vừa được cập nhật, đã tải lại.' : moveError.message || 'Không đổi được trạng thái trận.'); await load(); }
  }
  const progress = board?.progress;
  return <div className="ops-block-list">
    {error ? <p className="ops-error">{error}</p> : null}
    <section className="ops-block"><h2>Trung tâm điều hành <span className="ops-live-dot"><i />LIVE</span></h2><div className="ops-progress"><div className="ops-progress-item"><b>{progress ? `${progress.finalized}/${progress.total}` : '—'}</b><span>Tiến độ thi đấu</span></div><div className="ops-progress-item"><b>{formatClock(progress?.finish_at)}</b><span>Ước tính hoàn tất</span></div><div className="ops-progress-item"><b>{progress?.average_match_minutes == null ? '—' : `${progress.average_match_minutes} phút`}</b><span>Thời lượng trận trung bình</span></div></div></section>
    {call ? <section className="ops-call-card"><span>Thẻ đọc mic · Sân {call.court.label}</span><strong>Trận #{call.match.id}</strong><p>Vui lòng vào Sân {call.court.label}. BTC đã gọi trận này vào sân khởi động.</p><button type="button" className="ops-control-button" onClick={() => move(call.match, 'warmup', call.court.id)}>Đã gọi — chuyển sân sang Khởi động</button></section> : null}
    <section className="ops-court-grid">{(board?.courts || []).map((court) => { const match = court.matches?.find((item) => ['warmup', 'live', 'paused'].includes(item.status)); const clock = match ? matchElapsed(match, now, { warmupMinutes: board.settings?.warmupMinutes }) : null; return <article className={`ops-court-card is-${court.state}`} key={court.id}><h3>{court.label}</h3><p>{court.state === 'needs_call' ? 'Đang chờ gọi' : court.state}</p>{match ? <><p>Trận #{match.id} · {match.status}</p><p>{match.status === 'warmup' ? `Còn ${clock?.countdownSeconds ?? '—'} giây khởi động` : `Đồng hồ ${clock?.seconds ?? '—'} giây`}</p><div className="ops-court-actions">{match.status === 'warmup' ? <button type="button" className="ops-control-button" onClick={() => move(match, 'live', court.id)}>Bắt đầu đấu</button> : null}{match.status === 'live' ? <button type="button" className="ops-control-button" onClick={() => move(match, 'paused', court.id)}>Tạm dừng</button> : null}{match.status === 'paused' ? <button type="button" className="ops-control-button" onClick={() => move(match, 'live', court.id)}>Đấu tiếp</button> : null}<button type="button" className="ops-control-button" onClick={() => move(match, 'finalized', court.id)}>Ghi điểm / Chốt</button></div></> : court.state === 'needs_call' && court.active ? <button type="button" className="ops-control-button" onClick={() => { const next = board.queue?.[0]; if (next) setCall({ match: board.matches?.find((item) => item.id === next.id) || next, court }); }}>Gọi vào sân ngay</button> : <p className="ops-muted">{court.state === 'off' ? 'Ngưng dùng' : 'Không có trận cần xử lý'}</p>}</article>; })}</section>
  </div>;
}