'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listTournaments, listStages, getCourtBoard, listDivisions, getDivisionSetup } from '@/lib/tournamentV2Client';
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

// API /stages không trả match_count, nên chỉ dựa vào nó thì giải đã chốt vẫn bị coi là
// "chưa có lịch" và admin bị đẩy ngược về màn thiết lập. Stage chỉ được tạo khi chốt giải.
function hasSchedule(stages) {
  return (stages || []).length > 0;
}

// Readiness thiết lập lấy từ khối `setup` do server tính (spec Lát 0 §8), không tự suy từ roster.
function setupReady(setupAggregate, stages) {
  if (hasSchedule(stages)) return true;
  return Number(setupAggregate?.setup?.readiness?.completedThrough || 0) >= 3;
}

function setupReason(setupAggregate, stages) {
  if (hasSchedule(stages)) return '';
  const blocker = setupAggregate?.setup?.readiness?.blockers?.[0];
  if (blocker?.message) return blocker.message;
  return 'Chưa có lịch thi đấu; cần hoàn tất bốc thăm và chốt lịch.';
}

export default function TournamentConsoleV2({ tournamentId }) {
  const router = useRouter();
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
  const athletesReady = useMemo(() => setupReady(setupAggregate, stages), [setupAggregate, stages]);
  const scheduleReady = hasSchedule(stages);
  const readiness = {
    config: Boolean(tournament) && divisions.length > 0,
    courts: (board?.courts || []).some((court) => court.active),
    athletes: athletesReady,
    draw: scheduleReady,
    reason: setupReason(setupAggregate, stages),
  };
  const defaultStep = scheduleReady ? 'control' : (!athletesReady ? 'athletes' : 'draw');
  const stepProps = { tournamentId, tournament, stageId: activeStageId, stage: activeStage, stages, isAdmin, reload: load };

  useEffect(() => {
    if (loading || error || scheduleReady || !isAdmin) return;
    const params = new URLSearchParams({ create: 'internal', tournamentId: String(tournamentId) });
    if (effectiveDivisionId) params.set('divisionId', String(effectiveDivisionId));
    // Bước resume do server kẹp theo progress: không mở bước chưa đủ điều kiện.
    const resumeStep = Number(setupAggregate?.setup?.resumeStep || 1);
    params.set('step', String(Math.max(1, Math.min(4, resumeStep))));
    router.replace(`/giai-dau/v2?${params.toString()}`);
  }, [effectiveDivisionId, error, isAdmin, loading, router, scheduleReady, setupAggregate, tournamentId]);

  if (loading) return <div className="v2-state v2-loading"><span className="v2-spinner" aria-hidden="true" /><p>Đang tải dữ liệu giải...</p></div>;
  if (error) return <div className="v2-state v2-error"><p>{error}</p><button type="button" className="v2-btn-secondary" onClick={load}>Thử lại</button></div>;
  if (!scheduleReady && isAdmin) return <div className="v2-state v2-route-redirect"><p>Đang mở không gian thiết lập thống nhất...</p></div>;

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
