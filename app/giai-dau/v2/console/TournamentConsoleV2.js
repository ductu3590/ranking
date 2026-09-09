'use client';

import { useCallback, useEffect, useState } from 'react';
import { listTournaments, listStages, getCourtBoard } from '@/lib/tournamentV2Client';
import { getCurrentGroupClient } from '@/lib/groupClient';
import ConsoleShell from './ConsoleShell';
import CourtsStep from './steps/CourtsStep';
import ControlStep from './steps/ControlStep';
import LogStep from './steps/LogStep';
import DrawStep from './steps/DrawStep';
import ResultsTab from './tabs/ResultsTab';
import StandingsTab from './tabs/StandingsTab';
import BracketTab from './tabs/BracketTab';
import TeamsTab from './tabs/TeamsTab';
import SettingsTab from './tabs/SettingsTab';
import OpenRegTab from './tabs/OpenRegTab';
import './console.css';

export default function TournamentConsoleV2({ tournamentId }) {
  const [tournament, setTournament] = useState(null);
  const [stages, setStages] = useState([]);
  const [board, setBoard] = useState(null);
  const [activeStageId, setActiveStageId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, stageList, courtBoard] = await Promise.all([listTournaments(), listStages(tournamentId), getCourtBoard(tournamentId)]);
      setTournament((Array.isArray(list) ? list : []).find((item) => String(item.id) === String(tournamentId)) || null);
      const nextStages = Array.isArray(stageList) ? stageList : [];
      setStages(nextStages);
      setActiveStageId((previous) => previous && nextStages.some((stage) => String(stage.id) === String(previous)) ? previous : nextStages[0]?.id || null);
      setBoard(courtBoard || null);
    } catch (loadError) {
      setError(loadError.message || 'Không tải được dữ liệu giải.');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    setIsAdmin(getCurrentGroupClient().role === 'admin');
    load();
  }, [load]);

  const activeStage = stages.find((stage) => String(stage.id) === String(activeStageId)) || null;
  const isCommunity = tournament?.organizer_mode === 'community';
  const readiness = {
    config: Boolean(tournament) && stages.length > 0,
    courts: (board?.courts || []).some((court) => court.active),
    athletes: true,
    draw: stages.length > 0 && stages.every((stage) => (stage.match_count || 0) > 0),
  };
  const stepProps = { tournamentId, tournament, stageId: activeStageId, stage: activeStage, stages, isAdmin, reload: load };

  if (loading) return <div className="v2-state v2-loading"><span className="v2-spinner" aria-hidden="true" /><p>Đang tải dữ liệu giải...</p></div>;
  if (error) return <div className="v2-state v2-error"><p>{error}</p><button type="button" className="v2-btn-secondary" onClick={load}>Thử lại</button></div>;

  return <ConsoleShell tournament={tournament} tournamentId={tournamentId} progress={board?.progress} readiness={readiness}>
    {(step) => <>
      {stages.length > 1 && step !== 'control' && step !== 'log' ? <div className="ops-stage-picker" role="tablist" aria-label="Giai đoạn">
        {stages.map((stage) => <button key={stage.id} type="button" aria-pressed={String(activeStageId) === String(stage.id)} onClick={() => setActiveStageId(stage.id)}>{stage.name}</button>)}
      </div> : null}
      {step === 'config' ? <SettingsTab {...stepProps} /> : null}
      {step === 'courts' ? <CourtsStep {...stepProps} /> : null}
      {step === 'athletes' ? <><TeamsTab {...stepProps} />{isCommunity ? <OpenRegTab {...stepProps} /> : null}</> : null}
      {step === 'draw' ? <DrawStep {...stepProps} /> : null}
      {step === 'control' ? <ControlStep {...stepProps} /> : null}
      {step === 'schedule' ? <ResultsTab {...stepProps} /> : null}
      {step === 'standings' ? <><StandingsTab {...stepProps} /><BracketTab {...stepProps} /></> : null}
      {step === 'log' ? <LogStep {...stepProps} /> : null}
    </>}
  </ConsoleShell>;
}