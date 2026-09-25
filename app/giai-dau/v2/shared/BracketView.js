'use client';

import './shared.css';

// Sơ đồ nhánh dùng chung cho bàn điều hành và trang công khai (spec Epic 2 E2 §2.1; Stitch OPS-05).
// Nhận `groups` dạng board.schedule (nhóm theo match_key: cột vòng, Tranh hạng ba riêng, nhánh W/L/GF của loại kép)
// qua props, không tự fetch. Chỉ khi có `onSelectMatch` ô trận mới bấm được — trang công khai không truyền.

const BRACKET_TITLES = { W: 'Nhánh thắng', L: 'Nhánh thua', GF: 'Chung kết tổng' };

function nameOf(side) { return side?.name || side?.source || 'Chờ xác định'; }

function sectionOf(group) {
  const key = String(group.key || '').split(':').slice(1).join(':');
  if (key === 'grand_final' || key.startsWith('GF')) return 'GF';
  if (key.startsWith('W:')) return 'W';
  if (key.startsWith('L:')) return 'L';
  return null;
}

function isBracketGroup(group) {
  const key = String(group.key || '').split(':').slice(1).join(':');
  return !key.startsWith('round:');
}

function sideScore(item, slot) {
  if (!item.games || !item.games.length) return null;
  if ((item.rule?.bestOf || 1) === 1) return item.games[0][slot];
  return item.games.filter((game) => (slot === 'a' ? game.a > game.b : game.b > game.a)).length;
}

function statusChip(item) {
  if (item.status === 'finalized') return { label: item.resultType === 'walkover' ? 'W.O.' : 'Đã chốt', tone: 'done' };
  if (item.status === 'live' || item.status === 'paused') return { label: `Đang đấu${item.court ? ` · ${item.court}` : ''}`, tone: 'live' };
  if (item.status === 'warmup') return { label: `Khởi động${item.court ? ` · ${item.court}` : ''}`, tone: 'warm' };
  if (!item.a?.name || !item.b?.name) return { label: 'Chờ đối thủ', tone: 'wait' };
  return { label: 'Chưa đấu', tone: 'todo' };
}

// Trong khung "Nhánh thắng" không lặp lại tiền tố "Nhánh thắng · " ở tên cột / tên trận.
function stripPrefix(text, prefix) {
  const value = String(text || '');
  return prefix && value.startsWith(`${prefix} · `) ? value.slice(prefix.length + 3) : value;
}

export function BracketMatch({ item, onSelectMatch, prefix }) {
  const chip = statusChip(item);
  const done = item.status === 'finalized';
  const detail = done && (item.rule?.bestOf || 1) > 1 && item.games?.length ? item.games.map((game) => `${game.a}–${game.b}`).join(', ') : null;
  const body = <>
    <header className="bv-match-head">
      <span>{stripPrefix(item.title, prefix)}{item.court && item.status !== 'live' && item.status !== 'warmup' ? ` · ${item.court}` : ''} · BO{item.rule?.bestOf || 1}</span>
      <span className={`bv-chip is-${chip.tone}`}>{chip.label}</span>
    </header>
    {['a', 'b'].map((slot) => {
      const side = item[slot];
      const state = done && item.winnerSide ? (item.winnerSide === slot ? 'win' : 'lose') : '';
      const score = sideScore(item, slot);
      return <div key={slot} className={`bv-side ${state ? `is-${state}` : ''} ${side?.name ? '' : 'is-source'}`}>
        <span className="bv-name">{state === 'win' ? <i aria-hidden="true">✓</i> : null}{nameOf(side)}</span>
        {score != null ? <b className="bv-score">{score}</b> : null}
      </div>;
    })}
    {detail ? <p className="bv-detail">{detail}</p> : null}
  </>;
  const className = `bv-match is-${chip.tone}`;
  if (onSelectMatch) return <button type="button" className={className} onClick={() => onSelectMatch(item)}>{body}</button>;
  return <div className={className}>{body}</div>;
}

function Columns({ columns, onSelectMatch, prefix }) {
  return <div className="bv-scroll">
    <div className={`bv-columns ${columns.length === 1 ? 'is-single' : ''}`}>
      {columns.map((group, index) => <section key={group.key} className="bv-col" aria-label={group.title}>
        <h3 className="bv-col-head"><span className="bv-col-no">{index + 1}</span><span className="bv-col-title">{stripPrefix(group.title, prefix)}</span><small>{group.matches.length} trận · BO{group.matches[0]?.rule?.bestOf || 1}</small></h3>
        <div className="bv-col-body">
          {[...group.matches].sort((left, right) => (left.slot ?? 0) - (right.slot ?? 0)).map((item) => <BracketMatch key={item.id} item={item} onSelectMatch={onSelectMatch} prefix={prefix} />)}
        </div>
      </section>)}
    </div>
  </div>;
}

export default function BracketView({ groups = [], onSelectMatch }) {
  const bracketGroups = groups.filter(isBracketGroup);
  if (!bracketGroups.length) return <p className="bv-empty">Thể thức này không có sơ đồ nhánh — xem bảng xếp hạng.</p>;

  const sections = { W: [], L: [], GF: [] };
  for (const group of bracketGroups) {
    const section = sectionOf(group);
    if (section) sections[section].push(group);
  }
  const doubleElim = sections.W.length > 0;

  return <div className="bv">
    <div className="bv-legend" aria-label="Chú thích">
      <span className="bv-chip is-done">Đã chốt</span><span className="bv-chip is-live">Đang đấu</span><span className="bv-chip is-todo">Chưa đấu</span><span className="bv-chip is-wait">Chờ đối thủ</span>
    </div>
    {doubleElim ? ['W', 'L', 'GF'].map((key) => (sections[key].length
      ? <section key={key} className={`bv-section is-${key}`}><h2>{BRACKET_TITLES[key]}</h2><Columns columns={sections[key]} onSelectMatch={onSelectMatch} prefix={BRACKET_TITLES[key]} /></section>
      : null)) : (() => {
      const bronze = bracketGroups.filter((group) => String(group.key).endsWith(':third_place'));
      const main = bracketGroups.filter((group) => !String(group.key).endsWith(':third_place'));
      return <>
        <Columns columns={main} onSelectMatch={onSelectMatch} />
        {bronze.length ? <section className="bv-bronze" aria-label="Tranh hạng ba">
          <h2><span aria-hidden="true">🥉</span> Tranh hạng ba</h2>
          <div className="bv-bronze-body">{bronze.flatMap((group) => group.matches).map((item) => <BracketMatch key={item.id} item={item} onSelectMatch={onSelectMatch} />)}</div>
        </section> : null}
      </>;
    })()}
  </div>;
}
