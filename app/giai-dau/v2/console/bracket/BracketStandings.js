'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOperationsBoard, getStandings } from '@/lib/tournamentV2Client';
import BracketView from '../../shared/BracketView';
import { GroupTables, FinalRanking } from '../../shared/StandingsView';
import ScoreSheet from '../control/ScoreSheet';
import { runStageAction, stageActionLabel } from '../stageAction';
import '../control/control.css';
import './bracket-standings.css';

// Mục "Sơ đồ & xếp hạng" cho giải setup v4 (spec Epic 2 E2 §2; Stitch OPS-05 + OPS-06). Hai tab con dùng
// component chung ở app/giai-dau/v2/shared (trang công khai E3 dùng lại, không truyền onSelectMatch).

const FORMAT_LABEL = { round_robin: 'Vòng tròn', knockout: 'Loại trực tiếp', double_elim: 'Loại kép' };

function minutesBetween(from, to) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.round((end - start) / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút` : `${minutes} phút`;
}

function FinishCard({ board, tournamentId, isAdmin, onDone }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = board.schedule.flatMap((group) => group.matches);
  const open = board.progress.total - board.progress.finalized;
  const starts = items.map((item) => item.startedAt).filter(Boolean).sort();
  const ends = items.map((item) => item.endedAt).filter(Boolean).sort();
  const duration = starts.length && ends.length ? minutesBetween(starts[0], ends[ends.length - 1]) : null;
  const action = board.stageAction;
  const done = board.tournamentStatus === 'completed' || board.tournamentStatus === 'archived';

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const outcome = await runStageAction(action, tournamentId);
      setConfirming(false);
      onDone(outcome?.message || 'Đã cập nhật.');
    } catch (actionError) {
      setError(actionError.message || 'Không thực hiện được.');
    } finally {
      setBusy(false);
    }
  }

  return <aside className="bs-finish" aria-labelledby="bs-finish-title">
    <h2 id="bs-finish-title"><span aria-hidden="true">⚑</span> Kết thúc giải</h2>
    {done ? <p className="bs-state is-ok"><b>Giải đã kết thúc.</b> Tỉ số đã khoá, xếp hạng chung cuộc đã lưu.</p>
      : action && action.kind !== 'advance' ? <p className="bs-state is-ok"><b>Sẵn sàng chốt kết quả.</b> Còn 0 trận chưa chốt. Sau khi kết thúc, xếp hạng chung cuộc được lưu và giải chuyển sang “Đã kết thúc”.</p>
        : action ? <p className="bs-state is-warn"><b>{action.stageName} đã chốt hết trận.</b> Chốt để điền các cặp đi tiếp vào {action.nextStageName}.</p>
          : <p className="bs-state">Còn <strong>{open}</strong> trận chưa chốt. Chốt hết mới kết thúc giải được.</p>}
    <dl className="bs-stats">
      <div><dt>Tổng số trận</dt><dd>{board.progress.finalized}/{board.progress.total} trận</dd></div>
      <div><dt>Thời gian thi đấu</dt><dd>{duration || '—'}</dd></div>
    </dl>
    {error ? <p className="ops-banner is-error" role="alert">{error}</p> : null}
    {isAdmin && !done && !confirming ? <button type="button" className="ops-btn is-primary" disabled={!action || busy} onClick={() => setConfirming(true)}>{action ? stageActionLabel(action) : 'Kết thúc giải & chốt xếp hạng'}</button> : null}
    {isAdmin && confirming ? <div className="ops-next-confirm" role="alertdialog" aria-labelledby="bs-confirm-title">
      <p id="bs-confirm-title"><b>{action.kind === 'advance' ? `Chốt ${action.stageName}?` : 'Kết thúc giải?'}</b> {action.kind === 'advance'
        ? 'Sau khi chốt, sửa kết quả vòng này sẽ bị chặn vì cặp đi tiếp đã được điền vào vòng sau.'
        : 'Tỉ số bị khoá và xếp hạng chung cuộc được lưu lại.'}</p>
      <div className="ops-actions">
        <button type="button" className="ops-btn" disabled={busy} onClick={() => setConfirming(false)}>Hủy</button>
        <button type="button" className="ops-btn is-primary" disabled={busy} onClick={confirm}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button>
      </div>
    </div> : null}
  </aside>;
}

export default function BracketStandings({ tournamentId, isAdmin, onChanged }) {
  const [board, setBoard] = useState(null);
  const [standings, setStandings] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState(null);
  const [sheet, setSheet] = useState(null);

  const load = useCallback(async () => {
    try {
      const next = await getOperationsBoard(tournamentId);
      const entries = await Promise.all((next.stages || []).map((stage) => getStandings(stage.id).then((data) => [stage.id, data]).catch(() => [stage.id, null])));
      setBoard(next);
      setStandings(Object.fromEntries(entries));
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Không tải được sơ đồ và xếp hạng.');
    }
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);

  const names = useMemo(() => {
    const map = {};
    for (const item of (board?.schedule || []).flatMap((group) => group.matches)) {
      for (const side of [item.a, item.b]) if (side?.entryId != null && side.name) map[String(side.entryId)] = side.name;
    }
    return map;
  }, [board]);
  const titleById = useMemo(() => Object.fromEntries((board?.schedule || []).flatMap((group) => group.matches.map((item) => [String(item.id), item.title]))), [board]);

  if (!board && !error) return <div className="ops-state"><span className="v2-spinner" aria-hidden="true" /><p>Đang tải sơ đồ và xếp hạng…</p></div>;
  if (!board) return <div className="ops-state"><p className="ops-banner is-error">{error}</p><button type="button" className="ops-btn" onClick={load}>Thử lại</button></div>;

  const stages = board.stages || [];
  const bracketStageIds = new Set(stages.filter((stage) => stage.format !== 'round_robin').map((stage) => String(stage.id)));
  const bracketGroups = board.schedule.filter((group) => bracketStageIds.has(String(group.stageId)));
  const activeTab = tab || (bracketGroups.length ? 'bracket' : 'standings');
  const lastStage = stages[stages.length - 1] || null;
  const groupStages = stages.filter((stage) => stage.format === 'round_robin' && stage !== lastStage);
  const lastData = lastStage ? standings[lastStage.id] : null;
  const lastItems = lastStage ? board.schedule.filter((group) => String(group.stageId) === String(lastStage.id)).flatMap((group) => group.matches) : [];
  const finalMatch = lastItems.find((item) => item.code === 'GF') || lastItems.find((item) => item.code === 'F');
  const undecided = lastStage && lastStage.format !== 'round_robin'
    ? !finalMatch || finalMatch.status !== 'finalized'
    : lastItems.some((item) => item.status !== 'finalized');
  const tournamentDone = board.tournamentStatus === 'completed' || board.tournamentStatus === 'archived';
  const formatSummary = stages.length > 1 ? stages.map((stage) => stage.name).join(' → ') : (FORMAT_LABEL[lastStage?.format] || lastStage?.name || '');
  const pairCount = Object.keys(names).length;

  return <div className="bs-page">
    <header className="bs-head">
      <div>
        <h1>Sơ đồ & xếp hạng <span className="bs-format">{formatSummary} · {pairCount} cặp</span></h1>
        <p className="ops-muted">Cập nhật ngay khi BTC chốt tỉ số.</p>
      </div>
      <div className="ops-filter" role="tablist" aria-label="Xem">
        <button type="button" role="tab" aria-selected={activeTab === 'bracket'} onClick={() => setTab('bracket')}>Sơ đồ nhánh</button>
        <button type="button" role="tab" aria-selected={activeTab === 'standings'} onClick={() => setTab('standings')}>Xếp hạng</button>
      </div>
    </header>

    {error ? <p className="ops-banner is-error" role="alert">{error}</p> : null}
    {notice ? <p className="ops-banner is-ok" role="status">{notice} <button type="button" className="ops-link" onClick={() => setNotice('')}>Đóng</button></p> : null}

    {activeTab === 'bracket' ? <section className="bs-card">
      <BracketView groups={bracketGroups} onSelectMatch={setSheet} />
      <p className="bs-foot ops-muted">Cặp thắng được tự điền vào trận kế tiếp ngay khi chốt tỉ số · Số trận đã chốt: {board.progress.finalized}/{board.progress.total}</p>
    </section> : <div className="bs-standings">
      <div className="bs-main">
        {groupStages.map((stage) => {
          const data = standings[stage.id];
          const stageDone = stage.status === 'completed' || board.schedule.filter((group) => String(group.stageId) === String(stage.id)).every((group) => group.counts.finalized === group.counts.total);
          return <section key={stage.id} className="bs-card">
            <h2 className="bs-card-title"><i className="bs-dot" aria-hidden="true" />{stage.name}{stageDone ? <span className="bs-pill is-ok">Đã hoàn thành {stage.name.toLowerCase()}</span> : null}</h2>
            {data ? <GroupTables rows={data.standings || []} outlook={data.outlook || {}} names={names} criteria={data.tiebreak_criteria || []} /> : <p className="ops-muted">Không tải được bảng xếp hạng.</p>}
          </section>;
        })}
        {lastStage ? <section className="bs-card">
          <h2 className="bs-card-title"><i className="bs-dot is-gold" aria-hidden="true" />Xếp hạng chung cuộc
            {!tournamentDone && !undecided ? <span className="bs-pill is-warn">Tạm tính</span> : null}
            {tournamentDone ? <span className="bs-pill is-ok">Chính thức</span> : null}</h2>
          {lastStage.format === 'round_robin' && lastData && undecided
            ? <GroupTables rows={lastData.standings || []} outlook={{}} names={names} criteria={lastData.tiebreak_criteria || []} />
            : <FinalRanking rows={lastData?.standings || []} names={names} undecided={undecided} />}
        </section> : null}
      </div>
      <FinishCard board={board} tournamentId={tournamentId} isAdmin={isAdmin} onDone={(message) => { setNotice(message); load(); if (onChanged) onChanged(); }} />
    </div>}

    {sheet ? <ScoreSheet match={sheet} isAdmin={isAdmin} titleById={titleById} onClose={() => setSheet(null)} onSaved={(message) => { setSheet(null); setNotice(message); load(); }} /> : null}
  </div>;
}
