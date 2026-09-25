'use client';

import { useEffect, useMemo, useState } from 'react';
import BracketView from '../shared/BracketView';
import { GroupTables, FinalRanking } from '../shared/StandingsView';
import ShareActions from '../ShareActions';
import './public-live.css';

// Trang công khai cho VĐV + khán giả (spec Epic 2 E3; Stitch OPS-07, D30: 4 tab Trực tiếp · Lịch · Xếp hạng · Sơ đồ).
// Chỉ đọc: dữ liệu `board` đã chiếu công khai từ GET /public, dùng chung nhãn trận + component sơ đồ/xếp hạng với
// bàn điều hành. Không có thao tác quản trị; ô trận trên sơ đồ không bấm được.

const STATUS = { draft: 'Sắp diễn ra', scheduled: 'Chờ diễn ra', live: 'Đang diễn ra', completed: 'Đã kết thúc', archived: 'Đã kết thúc' };
const CRITERIA = {
  match_points: 'Điểm', diff: 'Hiệu số', point_diff: 'Hiệu số điểm', game_diff: 'Hiệu số ván', head_to_head: 'Đối đầu trực tiếp',
  points_for: 'Điểm ghi được', seed: 'Hạt giống', draw_lot: 'Bốc thăm',
};

function hhmm(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  return `${days[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
}

function nameOf(side) { return side?.name || side?.source || 'Chờ xác định'; }

function minutesSince(value, now) {
  const start = Date.parse(value);
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 60000)) : null;
}

function LiveCourt({ court, now }) {
  const match = court.match;
  const minutes = minutesSince(match.startedAt || match.warmupStartedAt, now);
  const warm = court.state === 'warmup';
  const bestOf = match.rule?.bestOf || 1;
  const wins = (slot) => match.games.filter((game) => (slot === 'a' ? game.a > game.b : game.b > game.a)).length;
  return <article className={`pl-live ${warm ? 'is-warm' : ''}`}>
    <header><b>{court.label}</b><span>· {match.title}</span><em className={`pl-chip ${warm ? 'is-warm' : 'is-live'}`}>{warm ? 'Khởi động' : court.state === 'paused' ? 'Tạm dừng' : `Đang đấu${minutes != null ? ` · ${minutes} phút` : ''}`}</em></header>
    <div className="pl-live-sides">
      {['a', 'b'].map((slot, index) => <div key={slot} className="pl-live-side">
        <span className="pl-slot">{index === 0 ? 'A' : 'B'}</span>
        <span className="pl-live-name">{nameOf(match[slot])}</span>
        {bestOf > 1 && match.games.length ? <span className="pl-wins">{wins(slot)} ván</span> : null}
      </div>).reduce((acc, node, i) => (i === 0 ? [node] : [...acc, <i key="vs" className="pl-vs">vs</i>, node]), [])}
    </div>
    <footer>{match.games.length ? <span className="pl-game-chip">✓ {match.games.map((game, i) => `Ván ${i + 1}: ${game.a}–${game.b}`).join(' · ')}</span> : <span>Thể thức: BO{bestOf}</span>}</footer>
  </article>;
}

function LiveTab({ courts, upcoming, recent, now }) {
  return <div className="pl-tab">
    <section className="pl-section">
      <h2><i className="pl-dot is-live" />Đang đấu <span className="pl-count is-live">{courts.length} sân</span></h2>
      {courts.length ? courts.map((court) => <LiveCourt key={court.label} court={court} now={now} />) : <p className="pl-empty">Chưa có trận nào đang đấu.</p>}
    </section>
    <section className="pl-section">
      <h2><i className="pl-dot is-warn" />Sắp tới <span className="pl-count is-warn">{upcoming.length} trận</span><small>Theo lịch gọi sân</small></h2>
      {upcoming.length ? <div className="pl-list">{upcoming.map((item) => <div key={item.id} className="pl-next">
        <header><span>{item.court ? `${item.court} · ` : ''}{item.title}</span>{item.projectedStart ? <em className="pl-eta">dự kiến {hhmm(item.projectedStart)}</em> : null}</header>
        <p><b className={item.a?.name ? '' : 'is-source'}>{nameOf(item.a)}</b><i>vs</i><b className={item.b?.name ? '' : 'is-source'}>{nameOf(item.b)}</b></p>
        <small>{item.stageName}{(item.rule?.bestOf || 1) > 1 ? ` · BO${item.rule.bestOf}` : ''}</small>
      </div>)}</div> : <p className="pl-empty">Không còn trận nào chờ.</p>}
    </section>
    <section className="pl-section">
      <h2><i className="pl-dot is-done" />Vừa xong <span className="pl-count">{recent.length} trận</span></h2>
      {recent.length ? <div className="pl-list">{recent.map((item) => <div key={item.id} className="pl-done">
        <header><span>{item.title}</span><small>{hhmm(item.endedAt)}{item.court ? ` · ${item.court}` : ''}</small></header>
        <p><b>{item.winnerName || '—'}</b> {item.resultType === 'walkover' ? 'thắng W.O.' : 'thắng'} {item.loserName ? <span>{item.loserName}</span> : null}{item.resultType !== 'walkover' && item.scoreText ? <em className="pl-score">{item.scoreText}</em> : null}</p>
      </div>)}</div> : <p className="pl-empty">Chưa có trận nào kết thúc.</p>}
    </section>
    <p className="pl-note">ⓘ <b>Lưu ý cho khán giả:</b> lịch và kết quả do BTC cập nhật tại sân. Chạm các tab phía trên để xem xếp hạng và sơ đồ.</p>
  </div>;
}

function ScheduleTab({ groups, stages }) {
  const [stageFilter, setStageFilter] = useState('all');
  const visible = groups.filter((group) => stageFilter === 'all' || String(group.stageId) === String(stageFilter));
  return <div className="pl-tab">
    {stages.length > 1 ? <div className="pl-seg" role="tablist" aria-label="Giai đoạn">
      {[{ id: 'all', name: 'Tất cả' }, ...stages].map((stage) => <button key={stage.id} type="button" role="tab" aria-selected={String(stageFilter) === String(stage.id)} onClick={() => setStageFilter(stage.id)}>{stage.name}</button>)}
    </div> : null}
    {visible.map((group) => <section key={group.key} className="pl-section">
      <h2><i className={`pl-dot ${group.counts.running ? 'is-live' : group.counts.finalized === group.counts.total ? 'is-done' : ''}`} />{group.title}<span className="pl-count">{group.counts.finalized}/{group.counts.total} xong</span></h2>
      <div className="pl-list">{group.matches.map((item) => {
        const done = item.status === 'finalized';
        const cls = (slot) => (item[slot]?.name ? (done && item.winnerSide ? (item.winnerSide === slot ? 'is-win' : 'is-lose') : '') : 'is-source');
        return <div key={item.id} className="pl-row">
          <p><b className={cls('a')}>{nameOf(item.a)}</b><i>vs</i><b className={cls('b')}>{nameOf(item.b)}</b></p>
          <span className="pl-row-score">{done ? (item.resultType === 'walkover' ? 'W.O.' : item.games.map((game) => `${game.a}–${game.b}`).join(', ')) : ['live', 'warmup', 'paused'].includes(item.status) ? <em className="pl-chip is-live">Đang đấu</em> : '–'}</span>
          <small>{item.court || ''}{done ? ` ${hhmm(item.endedAt)}` : item.projectedStart ? ` dự kiến ${hhmm(item.projectedStart)}` : ''}</small>
        </div>;
      })}</div>
    </section>)}
  </div>;
}

function StandingsTab({ stages, standingsByStage, names, groups, done }) {
  const last = stages[stages.length - 1];
  const lastItems = groups.filter((group) => String(group.stageId) === String(last?.id)).flatMap((group) => group.matches);
  const finalMatch = lastItems.find((item) => item.code === 'GF') || lastItems.find((item) => item.code === 'F');
  const undecided = last && last.format !== 'round_robin' ? !finalMatch || finalMatch.status !== 'finalized' : lastItems.some((item) => item.status !== 'finalized');
  const criteria = (stage) => (stage?.tiebreak?.order || []).map((key) => CRITERIA[key] || key);
  return <div className="pl-tab">
    {!undecided ? <section className="pl-section"><h2><i className="pl-dot is-gold" />Xếp hạng chung cuộc{done ? null : <span className="pl-count is-warn">Tạm tính</span>}</h2>
      <FinalRanking rows={standingsByStage[String(last.id)]?.standings || []} names={names} />
    </section> : null}
    {stages.filter((stage) => stage.format === 'round_robin').map((stage) => <section key={stage.id} className="pl-section">
      <h2><i className="pl-dot" />{stage.name}</h2>
      <GroupTables rows={standingsByStage[String(stage.id)]?.standings || []} names={names} criteria={criteria(stage)} />
    </section>)}
    {undecided && last && last.format !== 'round_robin' ? <section className="pl-section"><h2><i className="pl-dot is-gold" />Xếp hạng chung cuộc</h2><FinalRanking rows={[]} undecided /></section> : null}
  </div>;
}

function defaultTab(status) {
  if (status === 'live') return 'live';
  if (status === 'completed' || status === 'archived') return 'standings';
  return 'schedule';
}

export default function PublicLive({ data, initialDivisionId = null }) {
  const { tournament, board } = data;
  const divisions = data.divisions || [];
  const [divisionId, setDivisionId] = useState(initialDivisionId ?? divisions[0]?.id ?? null);
  const [tab, setTab] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    setTab(['live', 'schedule', 'standings', 'bracket'].includes(fromUrl) ? fromUrl : defaultTab(tournament.status));
  }, [tournament.status]);

  function selectTab(next) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  }

  const view = useMemo(() => {
    const stageTiebreak = new Map((data.stages || []).map((stage) => [String(stage.id), stage.tiebreak]));
    const stages = (board.stages || [])
      .filter((stage) => divisionId == null || stage.divisionId == null || String(stage.divisionId) === String(divisionId))
      .map((stage) => ({ ...stage, tiebreak: stageTiebreak.get(String(stage.id)) }));
    const stageIds = new Set(stages.map((stage) => String(stage.id)));
    const inDivision = (item) => stageIds.has(String(item.stageId));
    const groups = (board.schedule || []).filter((group) => stageIds.has(String(group.stageId)));
    const items = groups.flatMap((group) => group.matches);
    const upcomingReady = items.filter((item) => item.status === 'pending' && item.readiness !== 'waiting')
      .sort((left, right) => String(left.projectedStart || '~').localeCompare(String(right.projectedStart || '~')));
    const upcomingWaiting = items.filter((item) => item.status === 'pending' && item.readiness === 'waiting');
    const names = {};
    for (const entrant of data.entrants || []) names[String(entrant.id)] = entrant.name;
    return {
      stages,
      groups,
      courts: (board.courts || []).filter((court) => inDivision(court.match)),
      upcoming: [...upcomingReady.slice(0, 6), ...upcomingWaiting.slice(0, Math.max(0, 8 - Math.min(6, upcomingReady.length)))].slice(0, 8),
      recent: (board.recent || []).filter(inDivision).slice(0, 5),
      bracketGroups: groups.filter((group) => stages.some((stage) => String(stage.id) === String(group.stageId) && stage.format !== 'round_robin')),
      progress: { total: items.length, finalized: items.filter((item) => item.status === 'finalized').length },
      names,
    };
  }, [board, data.entrants, data.stages, divisionId]);

  const hasBracket = view.bracketGroups.length > 0;
  const activeTab = tab === 'bracket' && !hasBracket ? 'standings' : (tab || defaultTab(tournament.status));
  const percent = view.progress.total ? Math.round((view.progress.finalized / view.progress.total) * 100) : 0;
  const done = tournament.status === 'completed' || tournament.status === 'archived';
  const tabs = [['live', 'Trực tiếp'], ['schedule', 'Lịch'], ['standings', 'Xếp hạng'], ...(hasBracket ? [['bracket', 'Sơ đồ']] : [])];

  return <div className="pl-page">
    <div className="pl-topbar">
      <span className="pl-brand"><b>P</b><span><small>Cổng thông tin giải</small>PickHub</span></span>
      <button type="button" className="pl-share-btn" aria-expanded={sharing} onClick={() => setSharing((value) => !value)}>↗ Chia sẻ</button>
    </div>
    {sharing ? <div className="pl-share"><ShareActions snapshot={data} divisionId={divisionId} /></div> : null}

    <header className="pl-hero">
      <span className={`pl-status is-${tournament.status}`}>● {STATUS[tournament.status] || 'Sắp diễn ra'}</span>
      <h1>{tournament.name}</h1>
      {tournament.event_date || tournament.location ? <p>📍 {[formatDate(tournament.event_date), tournament.location].filter(Boolean).join(' · ')}</p> : null}
      <div className="pl-progress"><span>Tiến độ thi đấu</span><b>{view.progress.finalized}/{view.progress.total} trận đã xong</b></div>
      <div className="pl-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
    </header>

    {divisions.length > 1 ? <div className="pl-seg is-division" role="tablist" aria-label="Nội dung thi đấu">
      {divisions.map((division) => <button key={division.id} type="button" role="tab" aria-selected={String(divisionId) === String(division.id)} onClick={() => setDivisionId(division.id)}>{division.name}</button>)}
    </div> : null}

    <nav className="pl-tabs" role="tablist" aria-label="Xem">
      {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => selectTab(key)}>{key === 'live' && tournament.status === 'live' ? '● ' : ''}{label}</button>)}
    </nav>

    {activeTab === 'live' ? <LiveTab courts={view.courts} upcoming={view.upcoming} recent={view.recent} now={now} /> : null}
    {activeTab === 'schedule' ? <ScheduleTab groups={view.groups} stages={view.stages} /> : null}
    {activeTab === 'standings' ? <StandingsTab stages={view.stages} standingsByStage={data.standingsByStage || {}} names={view.names} groups={view.groups} done={done} /> : null}
    {activeTab === 'bracket' ? <div className="pl-tab"><BracketView groups={view.bracketGroups} /></div> : null}

    <footer className="pl-foot"><span>● Tự động cập nhật</span><span>PickHub</span></footer>
  </div>;
}
