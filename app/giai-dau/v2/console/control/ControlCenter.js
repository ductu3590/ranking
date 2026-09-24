'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOperationsBoard, transitionMatch, withdrawMatch, setCourtActive } from '@/lib/tournamentV2Client';
import { nextPollingDelay } from '@/lib/pollingBackoff';
import ScoreSheet from './ScoreSheet';
import NextStepCard from './NextStepCard';
import './control.css';

// Mục "Điều hành" (spec Epic 2, Lát E1 §5; thiết kế canonical/operations/01-control-center, 02-call-card).
// Một BTC chạy trọn ngày thi đấu ở đây: nhìn sân, gọi cặp vào sân, bắt đầu, nhập tỉ số, chốt.

const STATE_LABEL = { idle: 'Trống · chờ gọi', warmup: 'Khởi động', live: 'Đang đấu', paused: 'Tạm dừng', off: 'Ngưng dùng' };

function clock(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function hhmm(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function nameOf(side) { return side?.name || side?.source || 'Chờ xác định'; }

// D34: không còn mốc điểm cố định — chỉ hiện số ván.
function ruleChip(rule) { return rule ? `BO${rule.bestOf}` : ''; }

function Pairs({ match }) {
  return <div className="ops-pairs">
    <span className={match.a?.name ? '' : 'is-source'}>{nameOf(match.a)}</span>
    <i aria-hidden="true">vs</i>
    <span className={match.b?.name ? '' : 'is-source'}>{nameOf(match.b)}</span>
  </div>;
}

// Đồng hồ chạy phía client mỗi giây, gốc từ view model (không gọi API mỗi giây).
function useTicker(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}

function liveClock(court, warmupMinutes, now) {
  const match = court.match;
  if (!match) return null;
  if (match.status === 'warmup' && match.warmupStartedAt) {
    return { kind: 'countdown', seconds: (Date.parse(match.warmupStartedAt) + warmupMinutes * 60000 - now) / 1000 };
  }
  if ((match.status === 'live' || match.status === 'paused') && match.startedAt) {
    return { kind: 'elapsed', seconds: (now - Date.parse(match.startedAt)) / 1000 };
  }
  return court.clock;
}

function CourtCard({ court, warmupMinutes, isAdmin, busy, onCall, onAction, onScore, onMenu, now }) {
  const match = court.match;
  const current = liveClock(court, warmupMinutes, now);
  const chip = court.state === 'warmup'
    ? `Khởi động · còn ${clock(current?.seconds)}`
    : court.state === 'live' ? `Đang đấu · ${clock(current?.seconds)}`
      : court.state === 'paused' ? `Tạm dừng · ${clock(current?.seconds)}` : STATE_LABEL[court.state];
  return <article className={`ops-court is-${court.state}`}>
    <header className="ops-court-head">
      <div><h3>{court.label}</h3><p>{match ? match.title : court.state === 'off' ? 'Tạm ngưng' : 'Chờ gọi trận'}</p></div>
      <span className={`ops-state is-${court.state}`}>{chip}</span>
    </header>
    {match ? <>
      <span className="ops-rule">{ruleChip(match.rule)}</span>
      <Pairs match={match} />
    </> : null}
    {!match && court.state === 'idle' && court.suggestion ? <div className="ops-suggest">
      <span>Gợi ý tiếp theo · {court.suggestion.title}</span>
      <Pairs match={court.suggestion} />
    </div> : null}
    {!match && court.state === 'idle' && !court.suggestion ? <p className="ops-muted">Không có trận nào sẵn sàng.</p> : null}
    {court.state === 'off' ? <p className="ops-muted">Sân đang ngưng dùng.</p> : null}
    {isAdmin ? <div className="ops-court-actions">
      {court.state === 'idle' && court.suggestion ? <button type="button" className="ops-btn is-primary is-wide" disabled={busy} onClick={() => onCall(court.suggestion, court.id)}>Gọi vào sân</button> : null}
      {court.state === 'warmup' ? <button type="button" className="ops-btn is-warn is-wide" disabled={busy} onClick={() => onAction(match, 'live')}>Bắt đầu đấu</button> : null}
      {court.state === 'live' ? <button type="button" className="ops-btn is-ok is-wide" disabled={busy} onClick={() => onScore(match)}>Nhập tỉ số</button> : null}
      {court.state === 'paused' ? <button type="button" className="ops-btn is-primary is-wide" disabled={busy} onClick={() => onAction(match, 'live')}>Đấu tiếp</button> : null}
      {court.state === 'off' ? <button type="button" className="ops-btn is-wide" disabled={busy} onClick={() => onAction(null, 'court_on', court)}>Bật lại sân</button> : null}
      {match ? <button type="button" className="ops-btn ops-more" aria-label={`Thao tác khác · ${court.label}`} disabled={busy} onClick={() => onMenu(match, court)}>⋯</button> : null}
    </div> : null}
  </article>;
}

function MoreMenu({ match, court, onClose, onAction, onScore, onWithdraw }) {
  return <div className="ops-sheet-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="ops-menu" role="dialog" aria-modal="true" aria-label={`Thao tác · ${court.label}`}>
      <h3>{court.label} · {match.title}</h3>
      {match.status === 'warmup' ? <>
        <button type="button" onClick={() => onAction(match, 'pending')}>Hủy gọi (cần lý do)</button>
        <button type="button" onClick={() => onWithdraw(match, 'walkover')}>Xử thắng W.O. (cần lý do)</button>
      </> : null}
      {match.status === 'live' ? <>
        <button type="button" onClick={() => onScore(match)}>Nhập tỉ số</button>
        <button type="button" onClick={() => onAction(match, 'paused')}>Tạm dừng</button>
        <button type="button" onClick={() => onWithdraw(match, 'retired')}>Bỏ cuộc (cần lý do)</button>
      </> : null}
      {match.status === 'paused' ? <>
        <button type="button" onClick={() => onScore(match)}>Nhập tỉ số</button>
        <button type="button" onClick={() => onWithdraw(match, 'retired')}>Bỏ cuộc (cần lý do)</button>
      </> : null}
      <button type="button" className="is-cancel" onClick={onClose}>Đóng</button>
    </section>
  </div>;
}

function CallCard({ match, courts, initialCourtId, busy, onConfirm, onClose }) {
  const idle = courts.filter((court) => court.state === 'idle');
  const [courtId, setCourtId] = useState(initialCourtId ?? idle[0]?.id ?? null);
  const court = courts.find((item) => String(item.id) === String(courtId));
  return <div className="ops-sheet-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="ops-call" role="dialog" aria-modal="true" aria-labelledby="ops-call-title">
      <div className="ops-call-tags"><span className="ops-chip">🎙 Thẻ đọc mic</span>{court ? <span className="ops-chip is-brand">{court.label}</span> : null}</div>
      <h2 id="ops-call-title">Mời cặp <em>{nameOf(match.a)}</em> và cặp <em>{nameOf(match.b)}</em> vào {court ? court.label : '…'}</h2>
      <p className="ops-call-meta">{match.title} · {ruleChip(match.rule)}</p>
      <label className="ops-field">
        <span>Đổi sân</span>
        <select value={courtId ?? ''} onChange={(event) => setCourtId(event.target.value || null)}>
          {courts.filter((item) => item.state !== 'off').map((item) => <option key={item.id} value={item.id} disabled={item.state !== 'idle'}>{item.label}{item.state === 'idle' ? ' (trống)' : ` (${STATE_LABEL[item.state].toLowerCase()})`}</option>)}
        </select>
      </label>
      <div className="ops-actions">
        <button type="button" className="ops-btn" onClick={onClose}>Để sau</button>
        <button type="button" className="ops-btn is-primary" disabled={busy || !courtId} onClick={() => onConfirm(match, courtId)}>Đã gọi — bắt đầu khởi động</button>
      </div>
      <p className="ops-muted">Sau khi bấm, sân chuyển sang Khởi động và đếm ngược.</p>
    </section>
  </div>;
}

function ReasonDialog({ dialog, busy, onSubmit, onClose }) {
  const [reason, setReason] = useState('');
  const [loser, setLoser] = useState(null);
  const needsSide = dialog.kind === 'walkover' || dialog.kind === 'retired';
  const { match } = dialog;
  return <div className="ops-sheet-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="ops-call" role="dialog" aria-modal="true" aria-labelledby="ops-reason-title" onSubmit={(event) => { event.preventDefault(); onSubmit({ reason: reason.trim(), loserEntryId: loser }); }}>
      <h2 id="ops-reason-title" className="ops-reason-title">{dialog.title}</h2>
      <p className="ops-call-meta">{match.title}{match.court ? ` · ${match.court}` : ''}</p>
      {needsSide ? <fieldset className="ops-choice">
        <legend>{dialog.kind === 'walkover' ? 'Cặp không ra sân' : 'Cặp bỏ cuộc'}</legend>
        {['a', 'b'].map((slot) => <label key={slot}>
          <input type="radio" name="ops-loser" value={match[slot].entryId} checked={String(loser) === String(match[slot].entryId)} onChange={() => setLoser(match[slot].entryId)} />
          {nameOf(match[slot])}
        </label>)}
      </fieldset> : null}
      <label className="ops-field"><span>Lý do (bắt buộc)</span><textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus /></label>
      {needsSide ? <p className="ops-muted">Cặp còn lại thắng W.O.; kết quả không tính hiệu số ván/điểm và cặp thắng được điền vào trận sau.</p> : null}
      <div className="ops-actions">
        <button type="button" className="ops-btn" onClick={onClose}>Quay lại</button>
        <button type="submit" className={`ops-btn ${needsSide ? 'is-danger' : 'is-primary'}`} disabled={busy || !reason.trim() || (needsSide && loser == null)}>{dialog.confirm}</button>
      </div>
    </form>
  </div>;
}

export default function ControlCenter({ tournamentId, isAdmin, onSettings, onStandings, onMatches, onChanged }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [segment, setSegment] = useState('courts');
  const [stageFilter, setStageFilter] = useState('all');
  const [sheet, setSheet] = useState(null);
  const [call, setCall] = useState(null);
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const pollDelay = useRef(null);
  const pollTimer = useRef(null);
  useTicker(Boolean(board && board.courts.some((court) => court.match)));

  const load = useCallback(async () => {
    try {
      const next = await getOperationsBoard(tournamentId);
      setBoard(next);
      setError('');
      return true;
    } catch (loadError) {
      setError(loadError.message || 'Không tải được bàn điều hành.');
      return false;
    }
  }, [tournamentId]);

  // Làm mới bằng cùng nhịp với trang công khai: dừng khi tab ẩn, làm mới khi quay lại.
  useEffect(() => {
    let cancelled = false;
    function clear() { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } }
    function schedule(success) {
      if (cancelled || document.visibilityState === 'hidden') return;
      pollDelay.current = nextPollingDelay(pollDelay.current, { success });
      clear();
      pollTimer.current = setTimeout(async () => schedule(await load()), pollDelay.current);
    }
    async function refreshNow() {
      if (cancelled || document.visibilityState === 'hidden') return;
      clear();
      schedule(await load());
    }
    load().then(schedule);
    window.addEventListener('focus', refreshNow);
    document.addEventListener('visibilitychange', refreshNow);
    return () => { cancelled = true; clear(); window.removeEventListener('focus', refreshNow); document.removeEventListener('visibilitychange', refreshNow); };
  }, [load]);

  async function run(task, success) {
    setBusy(true);
    setError('');
    try {
      await task();
      if (success) setNotice(success);
      await load();
      return true;
    } catch (actionError) {
      setError(actionError.message || 'Thao tác không thành công.');
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onAction(match, to, court) {
    setMenu(null);
    if (to === 'court_on') return run(() => setCourtActive({ tournament_id: tournamentId, id: court.id, active: true, reason: '' }), `Đã bật lại ${court.label}.`);
    if (to === 'pending') {
      setDialog({ kind: 'cancel', match, title: 'Hủy gọi sân', confirm: 'Hủy gọi' });
      return undefined;
    }
    const labels = { live: 'Đã bắt đầu', paused: 'Đã tạm dừng' };
    return run(() => transitionMatch({ match_id: match.id, to, expected_version: match.version }), `${labels[to] || 'Đã cập nhật'} ${match.title}.`);
  }

  function onWithdraw(match, kind) {
    setMenu(null);
    setDialog(kind === 'walkover'
      ? { kind, match, title: 'Xử thắng W.O.', confirm: 'Xử thắng W.O.' }
      : { kind, match, title: 'Bỏ cuộc giữa trận', confirm: 'Xác nhận bỏ cuộc' });
  }

  async function submitDialog({ reason, loserEntryId }) {
    const { kind, match } = dialog;
    const ok = kind === 'cancel'
      ? await run(() => transitionMatch({ match_id: match.id, to: 'pending', reason, expected_version: match.version }), `Đã hủy gọi ${match.title}.`)
      : await run(() => withdrawMatch({ match_id: match.id, loser_entry_id: loserEntryId, reason, kind }), `Đã xử ${kind === 'walkover' ? 'thắng W.O.' : 'bỏ cuộc'} ${match.title}.`);
    if (ok) setDialog(null);
  }

  async function confirmCall(match, courtId) {
    const court = board.courts.find((item) => String(item.id) === String(courtId));
    const ok = await run(() => transitionMatch({ match_id: match.id, to: 'warmup', court_id: courtId, expected_version: match.version }), `Đã gọi ${match.title} vào ${court ? court.label : 'sân'}.`);
    if (ok) setCall(null);
  }

  if (!board && !error) return <div className="ops-state"><span className="v2-spinner" aria-hidden="true" /><p>Đang tải bàn điều hành…</p></div>;
  if (!board) return <div className="ops-state"><p className="ops-banner is-error">{error}</p><button type="button" className="ops-btn" onClick={load}>Thử lại</button></div>;

  const { progress, courts, settings } = board;
  const percent = progress.total ? Math.round((progress.finalized / progress.total) * 100) : 0;
  const now = Date.now();
  const allDone = progress.total > 0 && progress.finalized === progress.total;
  // Bộ lọc theo giai đoạn (Stitch OPS-01: "Tất cả nội dung · Vòng bảng · Loại trực tiếp") áp cho hàng chờ + vừa chốt.
  const stageOptions = board.stages || [];
  const inStage = (item) => stageFilter === 'all' || String(item.stageId) === String(stageFilter);
  const queue = board.queue.filter(inStage);
  const recent = board.recent.filter(inStage);
  const queueCount = queue.reduce((sum, group) => sum + group.matches.length, 0);
  const idleCourts = courts.filter((court) => court.state === 'idle').length;
  // Hết trận để gọi (mọi trận đã chốt hoặc đang chờ chốt chặng): thu gọn lưới sân, nhường chỗ cho thẻ việc tiếp theo.
  const nothingToRun = !courts.some((court) => court.match) && board.queue.every((group) => group.matches.every((item) => item.readiness === 'waiting'));

  return <div className={`ops-center is-seg-${segment}`}>
    <section className="ops-progress" aria-label="Tiến độ giải">
      <div className="ops-progress-main">
        <p><b>{progress.finalized}/{progress.total}</b> trận đã chốt <span className="ops-muted">({percent}%)</span></p>
        <div className="ops-progress-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
      </div>
      {stageOptions.length > 1 ? <div className="ops-filter" role="tablist" aria-label="Lọc theo giai đoạn">
        {[{ id: 'all', name: 'Tất cả' }, ...stageOptions].map((option) => <button key={option.id} type="button" role="tab" aria-selected={String(stageFilter) === String(option.id)} onClick={() => setStageFilter(option.id)}>{option.name}</button>)}
      </div> : null}
      <dl className="ops-progress-stats">
        <div><dt>Dự kiến xong</dt><dd>{hhmm(progress.finishAt)}</dd></div>
        <div><dt>TB mỗi trận</dt><dd>{progress.averageMatchMinutes == null ? '—' : `${progress.averageMatchMinutes} phút`}</dd></div>
        <div><dt>Sân đang dùng</dt><dd>{progress.busyCourts ?? 0}/{progress.activeCourts}</dd></div>
      </dl>
    </section>

    {error ? <p className="ops-banner is-error" role="alert">{error}</p> : null}
    {notice ? <p className="ops-banner is-ok" role="status">{notice} <button type="button" className="ops-link" onClick={() => setNotice('')}>Đóng</button></p> : null}
    {board.stageAction ? <NextStepCard action={board.stageAction} tournamentId={tournamentId} isAdmin={isAdmin}
      onStandings={onStandings}
      onDone={(message) => { setNotice(message); load(); if (onChanged) onChanged(); }} /> : null}
    {allDone && !board.stageAction ? <p className="ops-banner is-ok">Giải đã kết thúc. Xếp hạng chung cuộc ở mục “Sơ đồ & xếp hạng”.</p> : null}

    <div className="ops-segments" role="tablist" aria-label="Xem theo">
      {[['courts', `Sân (${courts.length})`], ['queue', `Hàng chờ (${queueCount})`], ['recent', 'Vừa chốt']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={segment === key} onClick={() => setSegment(key)}>{label}</button>)}
    </div>

    <div className="ops-layout">
      <div className="ops-main">
      {courts.length && nothingToRun ? <p className="ops-courts-done">Tất cả {courts.length} sân đang trống — {allDone ? 'không còn trận nào để gọi.' : 'các trận còn lại chờ kết quả vòng trước.'}</p> : null}
      {courts.length && !nothingToRun ? <div className="ops-section-head"><h2>Sân thi đấu trực tiếp <span className="ops-count-pill">{courts.length} sân</span></h2><span className="ops-muted">{idleCourts ? `${idleCourts} sân trống chờ gọi` : 'Tất cả sân đang có trận'}</span></div> : null}
      {nothingToRun && courts.length ? null : <section className="ops-courts" aria-label="Sân thi đấu">
        {courts.length ? courts.map((court) => <CourtCard key={court.id} court={court} warmupMinutes={settings.warmupMinutes} isAdmin={isAdmin} busy={busy} now={now}
          onCall={(match, courtId) => setCall({ match, courtId })}
          onAction={onAction}
          onScore={(match) => setSheet(match)}
          onMenu={(match, courtItem) => setMenu({ match, court: courtItem })} />)
          : <div className="ops-empty"><b>Chưa khai báo sân nào</b><p>Khai báo sân để gọi trận và theo dõi giờ dự kiến. Vẫn nhập tỉ số được ở mục Trận đấu.</p>{isAdmin ? <button type="button" className="ops-btn is-primary" onClick={onSettings}>Khai báo sân</button> : null}</div>}
      </section>}

      <section className="ops-recent" aria-label="Trận vừa chốt">
        <h2><span>Trận vừa chốt <small className="ops-muted">(gần nhất)</small></span>{onMatches && progress.finalized ? <button type="button" className="ops-link-plain" onClick={onMatches}>Xem toàn bộ {progress.finalized} trận →</button> : null}</h2>
        {recent.length ? recent.map((item) => <button key={item.id} type="button" className="ops-recent-row" onClick={() => setSheet(item)}>
          <span className="ops-recent-title">{item.title}</span>
          <span className="ops-recent-body"><b>{item.winnerName || '—'}</b>{item.resultType === 'walkover' ? ' thắng W.O.' : <> thắng <em className="ops-score-text">{item.scoreText || ''}</em></>}{item.loserName ? <> trước <span className="ops-recent-loser">{item.loserName}</span></> : null}</span>
          <span className="ops-recent-meta">{item.court || ''} {hhmm(item.endedAt)}<span className="ops-recent-open">Xem</span></span>
        </button>) : <p className="ops-muted">Chưa có trận nào chốt.</p>}
      </section>
      </div>

      {nothingToRun && !queueCount ? null : <aside className="ops-queue" aria-label="Hàng chờ theo lượt">
        <h2>Hàng chờ theo lượt <span className="ops-count">{queueCount} trận</span></h2>
        {queue.length ? queue.map((group) => <div key={group.key} className="ops-queue-group">
          <h3>{group.label}<span>{group.matches.length} trận{group.stageName ? ` · ${group.stageName}` : ''}</span></h3>
          {group.matches.map((item) => <div key={item.id} className={`ops-queue-row is-${item.readiness}`}>
            <div className="ops-queue-top"><b>{item.title}</b><span>{item.lockedStart ? `ghim ${hhmm(item.lockedStart)}` : `dự kiến ${hhmm(item.projectedStart)}`}</span></div>
            <Pairs match={item} />
            <div className="ops-queue-foot">
              {item.readiness === 'ready' ? <span className="ops-chip is-ok">Sẵn sàng</span> : null}
              {item.readiness === 'busy' ? <span className="ops-chip is-warn">Cặp đang đấu ở {item.busyCourt}</span> : null}
              {item.readiness === 'waiting' ? <span className="ops-chip">Chờ đối thủ</span> : null}
              {isAdmin && item.readiness === 'ready' && courts.some((court) => court.state === 'idle') ? <button type="button" className="ops-btn is-primary is-small" disabled={busy} onClick={() => setCall({ match: item, courtId: null })}>Gọi vào sân…</button> : null}
            </div>
          </div>)}
        </div>) : <p className="ops-muted">Không còn trận nào chờ.</p>}
      </aside>}

    </div>

    {sheet ? <ScoreSheet match={sheet} isAdmin={isAdmin} onClose={() => setSheet(null)} onSaved={(message) => { setSheet(null); setNotice(message); load(); }} /> : null}
    {call ? <CallCard match={call.match} courts={courts} initialCourtId={call.courtId} busy={busy} onClose={() => setCall(null)} onConfirm={confirmCall} /> : null}
    {menu ? <MoreMenu match={menu.match} court={menu.court} onClose={() => setMenu(null)} onAction={onAction} onScore={(match) => { setMenu(null); setSheet(match); }} onWithdraw={onWithdraw} /> : null}
    {dialog ? <ReasonDialog dialog={dialog} busy={busy} onClose={() => setDialog(null)} onSubmit={submitDialog} /> : null}
  </div>;
}
