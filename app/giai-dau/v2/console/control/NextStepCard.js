'use client';

import { useEffect, useState } from 'react';
import { getStandings, listEntrants } from '@/lib/tournamentV2Client';
import { runStageAction, stageActionLabel } from '../stageAction';

// Thẻ "việc tiếp theo" trong mục Điều hành (D35, nghiệm thu Epic 2): khi mọi trận của một chặng đã chốt,
// BTC chốt chặng / kết thúc giải ngay tại đây, không phải sang "Sơ đồ & xếp hạng". Hiện BXH tóm tắt để xem lại
// trước khi bấm (đồng điểm, suất đi tiếp); bấm lần hai để xác nhận vì chốt xong không đổi kết quả chặng được nữa.

function nameOf(entrantsById, id) {
  const entrant = entrantsById[String(id)];
  return entrant ? entrant.name : 'Cặp chưa đặt tên';
}

function GroupSummary({ rows, outlook, entrantsById }) {
  const groups = {};
  for (const row of rows) {
    const key = row.group_label || '';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  return <div className="ops-next-groups">
    {Object.keys(groups).sort().map((label) => <div key={label || 'all'} className="ops-next-group">
      {label ? <h3>Bảng {label}</h3> : null}
      <ol>
        {[...groups[label]].sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0)).map((row) => {
          const verdict = outlook?.[row.entrant_id]?.label || '';
          const advancing = ['qualified', 'provisional'].includes(outlook?.[row.entrant_id]?.status);
          return <li key={row.entrant_id} className={advancing ? 'is-advancing' : ''}>
            <span className="ops-next-rank">{row.rank ?? '–'}</span>
            <span className="ops-next-who">
              <span className="ops-next-name">{nameOf(entrantsById, row.entrant_id)}</span>
              <span className="ops-next-stat">{row.won ?? 0} thắng · {row.lost ?? 0} thua · {row.diff > 0 ? `+${row.diff}` : row.diff ?? 0}</span>
            </span>
            {verdict ? <span className={`ops-chip ${advancing ? 'is-ok' : ''}`}>{verdict}</span> : null}
          </li>;
        })}
      </ol>
    </div>)}
  </div>;
}

function Podium({ rows, entrantsById }) {
  const top = [...rows].filter((row) => row.rank != null).sort((left, right) => left.rank - right.rank).slice(0, 4);
  if (!top.length) return null;
  return <ol className="ops-next-podium">
    {top.map((row) => <li key={row.entrant_id}>
      <span className="ops-next-rank">{row.rank}</span>
      <span className="ops-next-name">{nameOf(entrantsById, row.entrant_id)}</span>
      {row.label ? <span className="ops-chip is-warn">{row.label}</span> : null}
    </li>)}
  </ol>;
}

export default function NextStepCard({ action, tournamentId, isAdmin, onDone, onStandings }) {
  const [standings, setStandings] = useState(null);
  const [entrantsById, setEntrantsById] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setConfirming(false);
    setError('');
    Promise.all([getStandings(action.stageId), listEntrants(tournamentId)])
      .then(([data, entrants]) => {
        if (!alive) return;
        setStandings(data || null);
        const map = {};
        for (const entrant of entrants || []) map[String(entrant.id)] = entrant;
        setEntrantsById(map);
      })
      .catch(() => { if (alive) setStandings(null); });
    return () => { alive = false; };
  }, [action.kind, action.stageId, tournamentId]);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const outcome = await runStageAction(action, tournamentId);
      setConfirming(false);
      onDone(outcome?.message || 'Đã cập nhật.');
    } catch (actionError) {
      setError(actionError.message || 'Không thực hiện được. Thử lại hoặc xem ở mục "Sơ đồ & xếp hạng".');
    } finally {
      setBusy(false);
    }
  }

  const advance = action.kind === 'advance';
  const rows = standings?.standings || [];
  const title = advance ? `${action.stageName} đã chốt hết trận` : 'Đã chốt toàn bộ trận';
  const lead = advance
    ? `Xem lại xếp hạng rồi chốt để điền các cặp đi tiếp vào ${action.nextStageName}.`
    : 'Kết thúc giải để chốt xếp hạng chung cuộc và chuyển giải sang “Đã kết thúc”.';

  return <section className={`ops-next ${advance ? 'is-advance' : 'is-finish'}`} aria-labelledby="ops-next-title">
    <header className="ops-next-head">
      <span className="ops-next-icon" aria-hidden="true">{advance ? '➜' : '🏆'}</span>
      <div>
        <h2 id="ops-next-title">{title}</h2>
        <p>{lead}</p>
      </div>
    </header>
    {standings == null ? <p className="ops-muted">Đang tính xếp hạng…</p>
      : advance ? <GroupSummary rows={rows} outlook={standings.outlook} entrantsById={entrantsById} />
        : <Podium rows={rows} entrantsById={entrantsById} />}
    {error ? <p className="ops-banner is-error" role="alert">{error}</p> : null}
    <div className="ops-next-actions">
      <button type="button" className="ops-btn" onClick={onStandings}>Xem sơ đồ & xếp hạng đầy đủ</button>
      {isAdmin && !confirming ? <button type="button" className="ops-btn is-primary" disabled={busy} onClick={() => setConfirming(true)}>{stageActionLabel(action)}</button> : null}
    </div>
    {isAdmin && confirming ? <div className="ops-next-confirm" role="alertdialog" aria-labelledby="ops-next-confirm-title">
      <p id="ops-next-confirm-title"><b>{advance ? `Chốt ${action.stageName}?` : 'Kết thúc giải?'}</b> {advance
        ? 'Sau khi chốt, sửa kết quả vòng này sẽ bị chặn vì cặp đi tiếp đã được điền vào vòng sau.'
        : 'Giải chuyển sang “Đã kết thúc”, xếp hạng chung cuộc được lưu lại.'}</p>
      <div className="ops-actions">
        <button type="button" className="ops-btn" disabled={busy} onClick={() => setConfirming(false)}>Quay lại</button>
        <button type="button" className="ops-btn is-primary" disabled={busy} onClick={confirm}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button>
      </div>
    </div> : null}
  </section>;
}
