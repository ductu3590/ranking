'use client';

import { useCallback, useEffect, useState } from 'react';
import { listTournaments, listStages, getCourtBoard, listDivisions } from '@/lib/tournamentV2Client';
import ConsoleShell from './ConsoleShell';
import CourtsStep from './steps/CourtsStep';
import ControlStep from './steps/ControlStep';
import LogStep from './steps/LogStep';
import DrawStep from './steps/DrawStep';
import ResultsTab from './tabs/ResultsTab';
import StandingsTab from './tabs/StandingsTab';
import BracketTab from './tabs/BracketTab';
import TeamsTab from './tabs/TeamsTab';
import DivisionSetupPanel from './tabs/DivisionSetupPanel';
import SettingsTab from './tabs/SettingsTab';
import OpenRegTab from './tabs/OpenRegTab';
import './console.css';

export default function TournamentConsoleV2({ tournamentId }) {
  const [tournament, setTournament] = useState(null);
  const [stages, setStages] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [setupDivisionId, setSetupDivisionId] = useState(null);
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
      // Nội dung thi đấu KHÔNG suy ra từ stage: stage có thể chưa tạo hoặc tạo hỏng,
      // nhưng admin vẫn phải vào được phần thiết lập danh tính VĐV.
      setSetupDivisionId((previous) => (previous && nextDivisions.some((division) => String(division.id) === String(previous))
        ? previous
        : nextDivisions[0]?.id ?? null));
    } catch (loadError) {
      setError(loadError.message || 'Không tải được dữ liệu giải.');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

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
  // Stage đang chọn dẫn hướng, nhưng không phải nguồn duy nhất của division.
  const effectiveDivisionId = activeStage?.division_id ?? setupDivisionId;
  const effectiveDivision = divisions.find((division) => String(division.id) === String(effectiveDivisionId)) || null;
  // Một nội dung chỉ được có MỘT nguồn chỉnh sửa. Khi thiết lập hợp nhất khả dụng,
  // TeamsTab chuyển sang chỉ-đọc để không ghi đè entry/pair bằng đường legacy.
  // CHỈ áp dụng cho nội dung ĐÔI: đơn/đội vẫn cần TeamsTab để thêm suất thi đấu,
  // vì DivisionSetupPanel không tạo được entrant cho hai thể thức đó.
  const unifiedSetup = Boolean(isAdmin && effectiveDivisionId && effectiveDivision?.play_type === 'doubles');
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

  return <ConsoleShell tournament={tournament} tournamentId={tournamentId} progress={board?.progress} readiness={readiness} actor={session}>
    {(step) => <>
      {stages.length > 1 && step !== 'control' && step !== 'log' ? <div className="ops-stage-picker" role="tablist" aria-label="Giai đoạn">
        {stages.map((stage) => <button key={stage.id} type="button" aria-pressed={String(activeStageId) === String(stage.id)} onClick={() => setActiveStageId(stage.id)}>{stage.name}</button>)}
      </div> : null}
      {step === 'config' ? <SettingsTab {...stepProps} /> : null}
      {step === 'courts' ? <CourtsStep {...stepProps} /> : null}
      {step === 'athletes' ? <>
        {isAdmin && divisions.length > 1 && !activeStage?.division_id ? <div className="ops-stage-picker" role="tablist" aria-label="Nội dung thi đấu">
          {divisions.map((division) => <button key={division.id} type="button" aria-pressed={String(setupDivisionId) === String(division.id)} onClick={() => setSetupDivisionId(division.id)}>{division.name}</button>)}
        </div> : null}
        {unifiedSetup ? <DivisionSetupPanel tournamentId={tournamentId} divisionId={effectiveDivisionId} isAdmin={isAdmin} onChanged={load} /> : null}
        <TeamsTab {...stepProps} isAdmin={unifiedSetup ? false : isAdmin} />
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
