'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOperationsBoard } from '@/lib/tournamentV2Client';
import ScoreSheet from '../control/ScoreSheet';
import '../control/control.css';
import './matches.css';

// Mục "Trận đấu" cho giải setup v4 (spec Epic 2 E2 §1; thiết kế canonical/operations/04-schedule-results).
// Mọi trận của giải, nhóm theo giai đoạn → lượt/vòng (Tranh hạng ba luôn tách riêng). Không có ô chọn BO theo
// vòng (D8/D14). Chạm dòng → sheet nhập tỉ số của E1; trận đã chốt → xem / "Sửa kết quả" (corrections).

const STATUS = {
  finalized: { label: 'Đã chốt', tone: 'done' },
  live: { label: 'Đang đấu', tone: 'live' },
  warmup: { label: 'Khởi động', tone: 'warm' },
  paused: { label: 'Tạm dừng', tone: 'warm' },
};

const STATUS_FILTERS = [
  { key: 'finalized', label: 'Đã chốt', tone: 'done', match: (item) => item.status === 'finalized' },
  { key: 'running', label: 'Đang đấu', tone: 'live', match: (item) => ['warmup', 'live', 'paused'].includes(item.status) },
  { key: 'pending', label: 'Chưa gọi', tone: 'todo', match: (item) => item.status === 'pending' },
];

function statusOf(item) {
  if (STATUS[item.status]) return STATUS[item.status];
  if (item.readiness === 'waiting') return { label: 'Chờ đối thủ', tone: 'wait' };
  return { label: 'Chưa gọi', tone: 'todo' };
}

function hhmm(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function timeOf(item) {
  if (item.status === 'finalized') return hhmm(item.endedAt);
  if (item.startedAt) return hhmm(item.startedAt);
  if (item.warmupStartedAt) return hhmm(item.warmupStartedAt);
  return item.projectedStart ? `~${hhmm(item.projectedStart)}` : '';
}

function nameOf(side) { return side?.name || side?.source || 'Chờ xác định'; }

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function Side({ side, state }) {
  return <span className={`mt-side ${side?.name ? '' : 'is-source'} ${state ? `is-${state}` : ''}`}>{nameOf(side)}</span>;
}

function MatchRow({ item, onOpen }) {
  const status = statusOf(item);
  const done = item.status === 'finalized';
  const sideState = (slot) => (!done || !item.winnerSide ? '' : item.winnerSide === slot ? 'win' : 'lose');
  return <button type="button" className={`mt-row is-${status.tone}`} onClick={() => onOpen(item)}>
    <span className="mt-title">{item.code && !/^(GROUP|RR)-/.test(item.code) ? <code>{item.code}</code> : null}<b>{item.title}</b></span>
    <span className="mt-pairs"><Side side={item.a} state={sideState('a')} /><i>vs</i><Side side={item.b} state={sideState('b')} /></span>
    <span className="mt-score">
      {item.games.length && done ? <b>{item.resultType === 'walkover' ? 'W.O.' : item.games.map((game) => `${game.a}–${game.b}`).join(', ')}</b>
        : item.games.length ? <b className="is-partial">{item.games.map((game) => `${game.a}–${game.b}`).join(', ')}</b>
          : item.status === 'live' ? <em>Đang thi đấu</em> : <span className="mt-dash">–</span>}
      <small>BO{item.rule?.bestOf || 1}</small>
    </span>
    <span className="mt-court">{item.court || '—'}</span>
    <span className="mt-time">{timeOf(item)}</span>
    <span className={`mt-status is-${status.tone}`}>{status.label}</span>
    <span className="mt-chevron" aria-hidden="true">›</span>
  </button>;
}

export default function MatchesView({ tournamentId, isAdmin }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sheet, setSheet] = useState(null);
  const [stageFilter, setStageFilter] = useState('all');
  const [roundFilter, setRoundFilter] = useState('all');
  const [courtFilter, setCourtFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setBoard(await getOperationsBoard(tournamentId));
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Không tải được danh sách trận.');
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
    function refresh() { if (document.visibilityState !== 'hidden') load(); }
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);

  const schedule = board?.schedule || [];
  const titleById = useMemo(() => Object.fromEntries(schedule.flatMap((group) => group.matches.map((item) => [String(item.id), item.title]))), [schedule]);
  const allItems = schedule.flatMap((group) => group.matches);
  const courtOptions = [...new Set(allItems.map((item) => item.court).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'vi', { numeric: true }));
  const roundOptions = schedule.filter((group) => stageFilter === 'all' || String(group.stageId) === String(stageFilter));

  const needle = normalize(query.trim());
  const visible = schedule
    .filter((group) => stageFilter === 'all' || String(group.stageId) === String(stageFilter))
    .filter((group) => roundFilter === 'all' || group.key === roundFilter)
    .map((group) => ({
      ...group,
      matches: group.matches.filter((item) => (courtFilter === 'all' || item.court === courtFilter)
        && (!statusFilter.length || STATUS_FILTERS.some((filter) => statusFilter.includes(filter.key) && filter.match(item)))
        && (!needle || normalize(`${nameOf(item.a)} ${nameOf(item.b)}`).includes(needle))),
    }))
    .filter((group) => group.matches.length);

  if (!board && !error) return <div className="ops-state"><span className="v2-spinner" aria-hidden="true" /><p>Đang tải danh sách trận…</p></div>;
  if (!board) return <div className="ops-state"><p className="ops-banner is-error">{error}</p><button type="button" className="ops-btn" onClick={load}>Thử lại</button></div>;

  const counts = Object.fromEntries(STATUS_FILTERS.map((filter) => [filter.key, allItems.filter(filter.match).length]));
  const toggleStatus = (key) => setStatusFilter((current) => (current.includes(key) ? current.filter((value) => value !== key) : [...current, key]));
  const filtered = stageFilter !== 'all' || roundFilter !== 'all' || courtFilter !== 'all' || statusFilter.length || needle;

  return <div className="mt-page">
    <header className="mt-head">
      <div>
        <h1>Trận đấu</h1>
        <p><span>{allItems.length} trận</span><span className="mt-count is-done">{counts.finalized} đã chốt</span><span className="mt-count is-live">{counts.running} đang đấu</span><span>{counts.pending} chưa đấu</span></p>
      </div>
      <p className="ops-muted">Chạm vào một trận để nhập hoặc xem tỉ số.</p>
    </header>

    <section className="mt-filters" aria-label="Lọc trận">
      {(board.stages || []).length > 1 ? <div className="ops-filter" role="tablist" aria-label="Giai đoạn">
        {[{ id: 'all', name: 'Tất cả' }, ...board.stages].map((option) => <button key={option.id} type="button" role="tab" aria-selected={String(stageFilter) === String(option.id)} onClick={() => { setStageFilter(option.id); setRoundFilter('all'); }}>{option.name}</button>)}
      </div> : null}
      <label className="mt-select"><span>Lượt</span>
        <select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
          <option value="all">Tất cả</option>
          {roundOptions.map((group) => <option key={group.key} value={group.key}>{group.title}{stageFilter === 'all' && (board.stages || []).length > 1 ? ` · ${group.stageName}` : ''}</option>)}
        </select>
      </label>
      {courtOptions.length ? <label className="mt-select"><span>Sân</span>
        <select value={courtFilter} onChange={(event) => setCourtFilter(event.target.value)}>
          <option value="all">Tất cả</option>
          {courtOptions.map((court) => <option key={court} value={court}>{court}</option>)}
        </select>
      </label> : null}
      <div className="mt-status-filters" role="group" aria-label="Trạng thái">
        {STATUS_FILTERS.map((filter) => <button key={filter.key} type="button" aria-pressed={statusFilter.includes(filter.key)} className={`mt-chip is-${filter.tone}`} onClick={() => toggleStatus(filter.key)}>{filter.label} ({counts[filter.key]})</button>)}
      </div>
      <input className="mt-search" type="search" placeholder="Tìm tên VĐV…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Tìm tên VĐV" />
    </section>

    {error ? <p className="ops-banner is-error" role="alert">{error}</p> : null}
    {notice ? <p className="ops-banner is-ok" role="status">{notice} <button type="button" className="ops-link" onClick={() => setNotice('')}>Đóng</button></p> : null}

    {visible.length ? visible.map((group) => {
      const complete = group.counts.finalized === group.counts.total;
      return <section key={group.key} className={`mt-group ${group.key.endsWith(':third_place') ? 'is-bronze' : ''}`}>
        <h2 className="mt-group-head">
          <span className={`mt-dot ${group.counts.running ? 'is-live' : complete ? 'is-done' : ''}`} aria-hidden="true" />
          <span className="mt-group-title">{group.title} · {group.counts.total} trận{complete ? ' · xong' : ''}</span>
          {group.counts.running ? <span className="mt-count is-live">{group.counts.running} đang đấu</span>
            : complete ? <span className="mt-count is-done">Hoàn tất {group.counts.finalized}/{group.counts.total}</span>
              : group.counts.finalized ? <span className="mt-count">{group.counts.finalized}/{group.counts.total} đã chốt</span> : null}
          <span className="mt-group-stage">{group.stageName}</span>
        </h2>
        <div className="mt-table-head" aria-hidden="true"><span>Trận</span><span>Cặp thi đấu</span><span>Tỉ số</span><span>Sân</span><span>Giờ</span><span>Trạng thái</span><span /></div>
        <div className="mt-rows">{group.matches.map((item) => <MatchRow key={item.id} item={item} onOpen={setSheet} />)}</div>
      </section>;
    }) : <div className="ops-empty"><b>{filtered ? 'Không có trận nào khớp bộ lọc' : 'Chưa có trận nào'}</b>{filtered ? <button type="button" className="ops-btn" onClick={() => { setStageFilter('all'); setRoundFilter('all'); setCourtFilter('all'); setStatusFilter([]); setQuery(''); }}>Bỏ lọc</button> : null}</div>}

    {sheet ? <ScoreSheet match={sheet} isAdmin={isAdmin} titleById={titleById} onClose={() => setSheet(null)} onSaved={(message) => { setSheet(null); setNotice(message); load(); }} /> : null}
  </div>;
}
