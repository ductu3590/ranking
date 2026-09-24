'use client';

import './shared.css';

// Bảng xếp hạng dùng chung cho bàn điều hành và trang công khai (spec Epic 2 E2 §2.2; Stitch OPS-06).
// Nhận dữ liệu của GET /standings qua props, không tự fetch. Nhãn hạng chung cuộc lấy nguyên từ server
// (computeStageStandings, nhãn loại trực tiếp / engine loại kép) — không tự gắn lại ở đây.

function nameOf(names, id) {
  return (names && names[String(id)]) || 'Cặp chưa đặt tên';
}

function signed(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

export function GroupTables({ rows = [], outlook = {}, names = {}, criteria = [] }) {
  const groups = {};
  for (const row of rows) (groups[row.group_label || ''] ||= []).push(row);
  const labels = Object.keys(groups).sort();
  const showOutlook = Object.keys(outlook || {}).length > 0;
  return <div className="sv-groups">
    <div className="sv-group-grid">
      {labels.map((label) => {
        const list = [...groups[label]].sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
        return <div key={label || 'all'} className="sv-group">
          <header><b>{label ? `Bảng ${label}` : 'Bảng xếp hạng'} ({list.length} cặp)</b><span>{list.reduce((sum, row) => sum + (Number(row.played) || 0), 0) / 2} trận đã đấu</span></header>
          <div className="sv-table-scroll">
            <table className="sv-table">
              <thead><tr><th>Hạng</th><th className="sv-name">Cặp</th><th>Trận</th><th>T–B</th><th>Hiệu số</th><th>Điểm</th></tr></thead>
              <tbody>
                {list.map((row) => {
                  const verdict = outlook?.[row.entrant_id];
                  const advancing = verdict && ['qualified', 'provisional'].includes(verdict.status);
                  return <tr key={row.entrant_id} className={advancing ? 'is-advancing' : ''}>
                    <td>{row.rank ?? '–'}</td>
                    <td className="sv-name"><span>{nameOf(names, row.entrant_id)}</span>{showOutlook && verdict ? <em className={`sv-chip ${advancing ? 'is-ok' : verdict.status === 'contending' ? 'is-warn' : ''}`}>{advancing ? `→ ${verdict.status === 'provisional' ? 'Tạm đi tiếp' : 'Đi tiếp'}` : verdict.label}</em> : null}</td>
                    <td>{row.played ?? 0}</td>
                    <td>{row.won ?? 0}–{row.lost ?? 0}</td>
                    <td>{signed(row.diff)}</td>
                    <td className="sv-pts">{row.match_points ?? 0}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>;
      })}
    </div>
    {criteria.length ? <p className="sv-criteria">ⓘ Tiêu chí: {criteria.join(' → ')}</p> : null}
  </div>;
}

const PODIUM_ORDER = [2, 1, 3];

export function FinalRanking({ rows = [], names = {}, provisional = false, undecided = false, note }) {
  const ranked = rows.filter((row) => row.rank != null).sort((left, right) => left.rank - right.rank);
  if (undecided || !ranked.length) {
    return <div className="sv-final"><p className="sv-undecided">Chưa xác định — xếp hạng chung cuộc có khi trận cuối cùng được chốt.</p></div>;
  }
  const byRank = (rank) => ranked.filter((row) => row.rank === rank);
  const rest = ranked.filter((row) => row.rank > 3);
  const restGroups = [];
  for (const row of rest) {
    const last = restGroups[restGroups.length - 1];
    if (last && last.rank === row.rank) last.rows.push(row);
    else restGroups.push({ rank: row.rank, rows: [row] });
  }
  return <div className="sv-final">
    {provisional ? <span className="sv-chip is-warn sv-provisional">Tạm tính</span> : null}
    <div className="sv-podium">
      {PODIUM_ORDER.map((rank) => byRank(rank).map((row) => <div key={row.entrant_id} className={`sv-podium-card is-${rank}`}>
        <span className="sv-podium-rank">Hạng {rank}</span>
        <b>{nameOf(names, row.entrant_id)}</b>
        <small>{row.label || (row.won != null ? `${row.won} thắng – ${row.lost ?? 0} thua` : '')}</small>
      </div>))}
    </div>
    {restGroups.length ? <ol className="sv-rest">
      {restGroups.map((group) => {
        const end = group.rank + group.rows.length - 1;
        return <li key={group.rank}>
          <span className="sv-rest-rank">{end > group.rank ? `${group.rank}–${end}` : group.rank}</span>
          <span className="sv-rest-names">{group.rows.map((row) => nameOf(names, row.entrant_id)).join(' · ')}</span>
          <small>{group.rows[0].label || ''}</small>
        </li>;
      })}
    </ol> : null}
    {note ? <p className="sv-criteria">{note}</p> : null}
  </div>;
}
