'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listTournaments, listStages, getCourtBoard, listDivisions, getDivisionSetup } from '@/lib/tournamentV2Client';
import { validateSetup } from '@/lib/tournament/setupValidation';
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

function hasSchedule(stages) {
  return (stages || []).some((stage) => Number(stage.match_count || 0) > 0);
}

function aggregateDraft(setupAggregate, divisionId) {
  const selected = setupAggregate?.roster?.athlete_ids || [];
  return {
    tournament: { name: 'Giải đấu' },
    participants: { selectedMemberIds: selected.map(String) },
    pairs: (setupAggregate?.pairs || []).map((pair) => ({ pairId: String(pair.id), memberIds: (pair.members || []).map((member) => String(member.member_id || member.tournament_athlete_id)) })),
    unpairedMemberIds: [],
    format: { entrantType: setupAggregate?.division?.play_type || 'doubles' },
    draw: { stagePlans: setupAggregate?.stages || [] },
    divisionId,
  };
}

function setupReason(validation, stages) {
  if (!validation.ready) return validation.blockers[0] || 'Thiết lập VĐV chưa đủ dữ liệu.';
  if (!hasSchedule(stages)) return 'Chưa có lịch thi đấu; cần hoàn tất bốc thăm và chốt lịch.';
  return '';
}

export default function TournamentConsoleV2({ tournamentId }) {
  const [tournament, setTournament] = useState(null);
  const [stages, setStages] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [setupDivisionId, setSetupDivisionId] = useState(null);
  const [setupAggregate, setSetupAggregate] = useState(null);
  const [board, setBoard] = useState(null);
  const [activeStageId, setActiveStageId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, stageList, courtBoard, divisionList] = await Promise.all([listTournaments(), listStages(tournamentId), getCourtBoard(tournamentId), listDivisions(tournamentId)]);
      setTournament((Array.isArray(list) ? list : []).find((item) => String(item.id) === String(tournamentId)) || null);
      const nextStages = Array.isArray(stageList) ? stageList : [];
      setStages(nextStages);
      setActiveStageId((previous) => previous && nextStages.some((stage) => String(stage.id) === String(previous)) ? previous : nextStages[0]?.id || null);
      setBoard(courtBoard || null);
      const nextDivisions = Array.isArray(divisionList) ? divisionList : [];
      setDivisions(nextDivisions);
      const nextSetupDivisionId = setupDivisionId && nextDivisions.some((division) => String(division.id) === String(setupDivisionId)) ? setupDivisionId : nextDivisions[0]?.id ?? null;
      setSetupDivisionId(nextSetupDivisionId);
      if (nextSetupDivisionId) {
        setSetupAggregate(await getDivisionSetup(tournamentId, nextSetupDivisionId).catch(() => null));
      } else {
        setSetupAggregate(null);
      }
    } catch (loadError) {
      setError(loadError.message || 'Không tải được dữ liệu giải.');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, setupDivisionId]);

  useEffect(() => {
    let active = true;
    fetch('/api/groups/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((view) => {
        if (!active) return;
        const nextSession = view?.session || null;
        setSession(nextSession);
        setIsAdmin(nextSession?.role === 'admin');
      })
      .catch(() => {
        if (active) {
          setSession(null);
          setIsAdmin(false);
        }
      });
    load();
    return () => { active = false; };
  }, [load]);

  const activeStage = stages.find((stage) => String(stage.id) === String(activeStageId)) || null;
  const effectiveDivisionId = activeStage?.division_id ?? setupDivisionId;
  const effectiveDivision = divisions.find((division) => String(division.id) === String(effectiveDivisionId)) || null;
  const isCommunity = tournament?.organizer_mode === 'community';
  const setupValidation = useMemo(() => validateSetup(aggregateDraft(setupAggregate, effectiveDivisionId)), [setupAggregate, effectiveDivisionId]);
  const scheduleReady = hasSchedule(stages);
  const readiness = {
    config: Boolean(tournament) && divisions.length > 0,
    courts: (board?.courts || []).some((court) => court.active),
    athletes: setupValidation.ready,
    draw: scheduleReady,
    reason: setupReason(setupValidation, stages),
  };
  const defaultStep = scheduleReady ? 'control' : (!setupValidation.ready ? 'athletes' : 'draw');
  const stepProps = { tournamentId, tournament, stageId: activeStageId, stage: activeStage, stages, isAdmin, reload: load };

  if (loading) return <div className="v2-state v2-loading"><span className="v2-spinner" aria-hidden="true" /><p>Đang tải dữ liệu giải...</p></div>;
  if (error) return <div className="v2-state v2-error"><p>{error}</p><button type="button" className="v2-btn-secondary" onClick={load}>Thử lại</button></div>;

  return <ConsoleShell tournament={tournament} tournamentId={tournamentId} progress={board?.progress} readiness={readiness} actor={session} defaultStep={defaultStep}>
    {(step) => <>
      {readiness.reason && (step === 'control' || step === 'draw' || step === 'athletes') ? <p className="v2-notice-info">{readiness.reason}</p> : null}
      {stages.length > 1 && step !== 'control' && step !== 'log' ? <div className="v2-stage-picker" role="tablist" aria-label="Giai đoạn">
        {stages.map((stage) => <button key={stage.id} type="button" className="v2-stage-seg" aria-pressed={String(activeStageId) === String(stage.id)} onClick={() => setActiveStageId(stage.id)}>{stage.name}</button>)}
      </div> : null}
      {step === 'config' ? <SettingsTab {...stepProps} /> : null}
      {step === 'courts' ? <CourtsStep {...stepProps} /> : null}
      {step === 'athletes' ? <>
        {isAdmin && divisions.length > 1 && !activeStage?.division_id ? <div className="v2-stage-picker" role="tablist" aria-label="Nội dung thi đấu">
          {divisions.map((division) => <button key={division.id} type="button" className="v2-stage-seg" aria-pressed={String(setupDivisionId) === String(division.id)} onClick={() => setSetupDivisionId(division.id)}>{division.name}</button>)}
        </div> : null}
        <TeamsTab {...stepProps} isAdmin={effectiveDivision?.play_type === 'doubles' ? false : isAdmin} />
        {isCommunity ? <OpenRegTab {...stepProps} /> : null}
      </> : null}
      {step === 'draw' ? <DrawStep {...stepProps} /> : null}
      {step === 'control' ? <ControlStep {...stepProps} /> : null}
      {step === 'schedule' ? <ResultsTab {...stepProps} /> : null}
      {step === 'standings' ? <><StandingsTab {...stepProps} /><BracketTab {...stepProps} /></> : null}
      {step === 'log' ? <LogStep {...stepProps} /> : null}
    </>}
  </ConsoleShell>;
}
