'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import BracketView from '../shared/BracketView';
import { GroupTables, FinalRanking } from '../shared/StandingsView';
import ShareActions from '../ShareActions';
import './public-live.css';

// Font đúng thiết kế Stitch OPS-07; app gốc chỉ tải Montserrat nên các khối rơi về font hệ thống khác nhau.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700', '800'], variable: '--pl-font', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin', 'vietnamese'], weight: ['500', '600', '700'], variable: '--pl-mono-font', display: 'swap' });

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

function formatText(bestOf) {
  return bestOf > 1 ? `BO${bestOf} (thắng ${Math.floor(bestOf / 2) + 1} ván)` : '1 ván';
}

function isKnockoutCode(code) {
  return Boolean(code) && !/^(GROUP|RR)-/.test(code);
}

// Thẻ sân đang đấu (Stitch OPS-07 · "Đang đấu"): vạch xanh trái, huy hiệu A/B (vòng bảng) hoặc 1/2 (loại trực tiếp),
// số ván thắng mỗi bên khi BO > 1, chân thẻ = ván đã lưu + "Đang đánh Ván n".
function LiveCourt({ court, now }) {
  const match = court.match;
  const minutes = minutesSince(match.startedAt || match.warmupStartedAt, now);
  const warm = court.state === 'warmup';
  const paused = court.state === 'paused';
  const bestOf = match.rule?.bestOf || 1;
  const games = match.games || [];
  const wins = (slot) => games.filter((game) => (slot === 'a' ? game.a > game.b : game.b > game.a)).length;
  const knockout = isKnockoutCode(match.code);
  const leader = wins('a') === wins('b') ? null : wins('a') > wins('b') ? 'a' : 'b';
  const needed = Math.floor(bestOf / 2) + 1;
  const decided = wins('a') >= needed || wins('b') >= needed;
  const chip = warm ? 'Khởi động' : paused ? 'Tạm dừng' : `Đang đấu${minutes != null ? ` · ${minutes} phút` : ''}`;
  return <article className={`pl-court ${warm || paused ? 'is-warm' : ''}`}>
    <header className="pl-court-head">
      <p><b>{court.label}</b><span className="pl-sep">·</span><span>{match.title}</span></p>
      <em className={`pl-live-chip ${warm || paused ? 'is-warm' : ''}`}><i />{chip}</em>
    </header>
    <div className="pl-matchup">
      {['a', 'b'].map((slot, index) => <div key={slot} className="pl-side">
        <span className={`pl-badge ${knockout && leader === slot ? 'is-lead' : ''}`}>{knockout ? index + 1 : (index === 0 ? 'A' : 'B')}</span>
        <span className="pl-name">{nameOf(match[slot])}</span>
        {bestOf > 1 ? <span className={`pl-wins ${leader === slot ? 'is-lead' : ''}`}>{wins(slot)} ván</span> : null}
      </div>).reduce((acc, node, i) => (i === 0 ? [node] : [...acc, <div key="vs" className="pl-vs-line" aria-hidden="true"><i />vs<i /></div>, node]), [])}
    </div>
    <footer className="pl-court-foot">
      {games.length
        ? <><span className="pl-saved">✓ {games.map((game, i) => <span key={i}>Ván {i + 1}: <strong>{game.a}–{game.b}</strong></span>).reduce((acc, node, i) => (i === 0 ? [node] : [...acc, ' · ', node]), [])}</span>
          {!decided && !warm ? <span>Đang đánh Ván {games.length + 1}</span> : null}</>
        : <span>Thể thức: {formatText(bestOf)}</span>}
    </footer>
  </article>;
}

function SourceChip({ side, tone }) {
  return side?.name ? <span className="pl-name">{side.name}</span> : <span className={`pl-source ${tone}`}>{nameOf(side)}</span>;
}

// Dòng "Sắp tới": sân + giờ dự kiến; trận chờ nguồn (Thắng/Thua …) tô tím, Tranh hạng ba xám (Stitch OPS-07).
function UpcomingRow({ item }) {
  const bronze = item.code === 'BRONZE';
  const waiting = !item.a?.name || !item.b?.name;
  const knockout = isKnockoutCode(item.code);
  const tone = bronze ? 'is-slate' : 'is-brand';
  const bestOf = item.rule?.bestOf || 1;
  const court = item.court || item.projectedCourt;
  const sub = [!knockout && court ? item.title : null, bestOf > 1 ? formatText(bestOf) : null].filter(Boolean).join(' · ');
  return <div className={`pl-up ${waiting && !bronze ? 'is-source' : ''}`}>
    <header>
      <span>{court ? <><b>{court}</b>{knockout ? <span className="pl-up-title"> · {item.title}</span> : null}</> : <b>{item.title}</b>}</span>
      {item.projectedStart ? <em className={`pl-eta ${bronze ? 'is-slate' : ''}`}>dự kiến {hhmm(item.projectedStart)}</em> : null}
    </header>
    <p className="pl-pair"><SourceChip side={item.a} tone={tone} /><small>vs</small><SourceChip side={item.b} tone={tone} /></p>
    {sub ? <small className="pl-up-sub">{sub}</small> : null}
  </div>;
}

function Block({ tone, icon, title, count, aside, children }) {
  return <section className={`pl-block is-${tone}`}>
    <div className="pl-block-head">
      <p><span className="pl-block-icon" aria-hidden="true">{icon}</span><b>{title}</b><span className="pl-block-count">{count}</span></p>
      {aside}
    </div>
    <div className="pl-block-body">{children}</div>
  </section>;
}

function LiveTab({ courts, upcoming, recent, finalizedCount, now, onSeeAll }) {
  return <div className="pl-tab">
    <Block tone="live" icon="▶" title="Đang đấu" count={`${courts.length} sân đang thi đấu`} aside={<span className="pl-aside">Cập nhật tự động</span>}>
      {courts.length ? courts.map((court) => <LiveCourt key={court.label} court={court} now={now} />) : <p className="pl-empty">Chưa có trận nào đang đấu.</p>}
    </Block>
    <Block tone="next" icon="◷" title="Sắp tới" count={`${upcoming.length} trận`} aside={<span className="pl-aside">Theo lịch gọi sân</span>}>
      {upcoming.length ? upcoming.map((item) => <UpcomingRow key={item.id} item={item} />) : <p className="pl-empty">Không còn trận nào chờ.</p>}
    </Block>
    <Block tone="done" icon="✓" title="Vừa xong" count={`${finalizedCount} trận`} aside={finalizedCount ? <button type="button" className="pl-see-all" onClick={onSeeAll}>Xem tất cả</button> : null}>
      {recent.length ? recent.map((item) => <div key={item.id} className="pl-done">
        <header><span>{item.title}</span><span>{[hhmm(item.endedAt), item.court].filter(Boolean).join(' · ')}</span></header>
        <div className="pl-done-body">
          <p className="pl-pair"><span className="pl-name is-win">{item.winnerName || '—'}</span><small>{item.resultType === 'walkover' ? 'thắng W.O.' : 'thắng'}</small>{item.loserName ? <span className="pl-name is-lose">{item.loserName}</span> : null}</p>
          {item.resultType !== 'walkover' && item.scoreText ? <em className="pl-score">{item.scoreText}</em> : null}
        </div>
      </div>) : <p className="pl-empty">Chưa có trận nào kết thúc.</p>}
    </Block>
    <p className="pl-note"><span aria-hidden="true">ⓘ</span><span><b>Lưu ý cho khán giả:</b> Lịch và kết quả do BTC cập nhật tại sân. Chạm các tab phía trên để xem xếp hạng và sơ đồ.</span></p>
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
        const cls = (slot) => (item[slot]?.name ? `pl-name ${done && item.winnerSide ? (item.winnerSide === slot ? 'is-win' : 'is-lose') : ''}` : 'pl-source is-brand');
        return <div key={item.id} className="pl-row">
          <p className="pl-pair"><span className={cls('a')}>{nameOf(item.a)}</span><small>vs</small><span className={cls('b')}>{nameOf(item.b)}</span></p>
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

  const clubName = data.club?.name || 'PickHub';
  const live = tournament.status === 'live';

  return <div className={`pl-page ${jakarta.variable} ${jetbrains.variable}`}>
    <header className="pl-topbar">
      <span className="pl-brand"><b>P</b><span><small>Cổng thông tin giải</small>{clubName}</span></span>
      <button type="button" className="pl-share-btn" aria-expanded={sharing} onClick={() => setSharing((value) => !value)}><span aria-hidden="true">⤴</span>Chia sẻ</button>
    </header>
    {sharing ? <div className="pl-share"><ShareActions snapshot={data} divisionId={divisionId} /></div> : null}

    <div className="pl-hero-wrap">
      <section className="pl-hero">
        <div className="pl-hero-top"><span className="pl-club">{clubName}</span><span className={`pl-status is-${tournament.status}`}><i />{STATUS[tournament.status] || 'Sắp diễn ra'}</span></div>
        <h1>{tournament.name}</h1>
        {tournament.event_date || tournament.location ? <p className="pl-where"><span aria-hidden="true">⌖</span><span>{[formatDate(tournament.event_date), tournament.location].filter(Boolean).join(' · ')}</span></p> : null}
        <div className="pl-progress">
          <div><span>Tiến độ thi đấu</span><b>{view.progress.finalized}/{view.progress.total} trận đã xong</b></div>
          <div className="pl-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
        </div>
      </section>
    </div>

    {divisions.length > 1 ? <div className="pl-division" role="tablist" aria-label="Nội dung thi đấu">
      {divisions.map((division) => <button key={division.id} type="button" role="tab" aria-selected={String(divisionId) === String(division.id)} onClick={() => setDivisionId(division.id)}>{division.name}</button>)}
    </div> : null}

    <nav className="pl-tabs" role="tablist" aria-label="Xem" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => selectTab(key)}>{key === 'live' && live ? <i className="pl-ping" aria-hidden="true" /> : null}{label}</button>)}
    </nav>

    <div className="pl-main">
      {activeTab === 'live' ? <LiveTab courts={view.courts} upcoming={view.upcoming} recent={view.recent} finalizedCount={view.progress.finalized} now={now} onSeeAll={() => selectTab('schedule')} /> : null}
      {activeTab === 'schedule' ? <ScheduleTab groups={view.groups} stages={view.stages} /> : null}
      {activeTab === 'standings' ? <StandingsTab stages={view.stages} standingsByStage={data.standingsByStage || {}} names={view.names} groups={view.groups} done={done} /> : null}
      {activeTab === 'bracket' ? <div className="pl-tab"><BracketView groups={view.bracketGroups} /></div> : null}
    </div>

    <footer className="pl-foot"><span><i className="pl-pulse" aria-hidden="true" />Tự động cập nhật</span><span>{clubName}</span></footer>
  </div>;
}
