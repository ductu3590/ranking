'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { listTournaments, listStages, getCourtBoard, listDivisions, getDivisionSetup } from '@/lib/tournamentV2Client';
import ConsoleShell from './ConsoleShell';
import ControlCenter from './control/ControlCenter';
import CourtsStep from './steps/CourtsStep';
import LogStep from './steps/LogStep';
import DrawStep from './steps/DrawStep';
import ResultsTab from './tabs/ResultsTab';
import StandingsTab from './tabs/StandingsTab';
import BracketTab from './tabs/BracketTab';
import TeamsTab from './tabs/TeamsTab';
import SettingsTab from './tabs/SettingsTab';
import OpenRegTab from './tabs/OpenRegTab';
import './console.css';

// API /stages không trả match_count; stage chỉ được tạo khi chốt giải nên có stage = đã có lịch.
function hasSchedule(stages) {
  return (stages || []).length > 0;
}

// Bàn điều hành 4 mục (ADR-007 D29, spec Epic 2 Lát E1 §2): Điều hành · Trận đấu · Sơ đồ & xếp hạng · Cài đặt.
// E1 làm đầy "Điều hành"; ba mục còn lại tạm dùng component hiện có (E2 thay thế).
export default function TournamentConsoleV2({ tournamentId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tournament, setTournament] = useState(null);
  const [stages, setStages] = useState([]);
  const [divisions, setDivisions] = useState([]);
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
      setActiveStageId((previous) => (previous && nextStages.some((stage) => String(stage.id) === String(previous)) ? previous : nextStages[0]?.id || null));
      setBoard(courtBoard || null);
      const nextDivisions = Array.isArray(divisionList) ? divisionList : [];
      setDivisions(nextDivisions);
      const firstDivisionId = nextDivisions[0]?.id ?? null;
      setSetupAggregate(!hasSchedule(nextStages) && firstDivisionId ? await getDivisionSetup(tournamentId, firstDivisionId).catch(() => null) : null);
    } catch (loadError) {
      setError(loadError.message || 'Không tải được dữ liệu giải.');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    let active = true;
    fetch('/api/groups/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((view) => {
        if (!active) return;
        const nextSession = view?.session || null;
        setSession(nextSession);
        setIsAdmin(nextSession?.role === 'admin');
      })
      .catch(() => {
        if (active) { setSession(null); setIsAdmin(false); }
      });
    load();
    return () => { active = false; };
  }, [load]);

  const scheduleReady = hasSchedule(stages);
  const activeStage = stages.find((stage) => String(stage.id) === String(activeStageId)) || null;
  const firstDivision = divisions[0] || null;
  const isCommunity = tournament?.organizer_mode === 'community';
  const stepProps = { tournamentId, tournament, stageId: activeStageId, stage: activeStage, stages, isAdmin, reload: load };

  // Giải chưa chốt lịch: việc chuẩn bị nằm ở workspace setup 4 bước (bước resume do server kẹp).
  useEffect(() => {
    if (loading || error || scheduleReady || !isAdmin) return;
    const params = new URLSearchParams({ create: 'internal', tournamentId: String(tournamentId) });
    if (firstDivision?.id) params.set('divisionId', String(firstDivision.id));
    const resumeStep = Number(setupAggregate?.setup?.resumeStep || 1);
    params.set('step', String(Math.max(1, Math.min(4, resumeStep))));
    router.replace(`/giai-dau/v2?${params.toString()}`);
  }, [error, firstDivision, isAdmin, loading, router, scheduleReady, setupAggregate, tournamentId]);

  // Link cũ ?tab=openreg: mở Cài đặt và cuộn tới thẻ Đăng ký mở (spec E1 §2).
  const openRegLink = searchParams.get('tab') === 'openreg';
  useEffect(() => {
    if (!openRegLink || loading || !isCommunity) return;
    const card = document.getElementById('dang-ky-mo');
    if (card) card.scrollIntoView({ block: 'start' });
  }, [isCommunity, loading, openRegLink]);

  function goStep(step) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', step);
    params.delete('tab');
    router.push(`?${params.toString()}`);
  }
  const goSettings = () => goStep('settings');

  if (loading && !tournament) return <div className="v2-state v2-loading"><span className="v2-spinner" aria-hidden="true" /><p>Đang tải dữ liệu giải...</p></div>;
  if (error) return <div className="v2-state v2-error"><p>{error}</p><button type="button" className="v2-btn-secondary" onClick={load}>Thử lại</button></div>;
  if (!scheduleReady && isAdmin) return <div className="v2-state v2-route-redirect"><p>Đang mở không gian thiết lập thống nhất...</p></div>;

  const stagePicker = stages.length > 1 ? <div className="v2-stage-picker" role="tablist" aria-label="Giai đoạn">
    {stages.map((stage) => <button key={stage.id} type="button" className="v2-stage-seg" aria-pressed={String(activeStageId) === String(stage.id)} onClick={() => setActiveStageId(stage.id)}>{stage.name}</button>)}
  </div> : null;

  return <ConsoleShell tournament={tournament} tournamentId={tournamentId} progress={board?.progress} actor={session}>
    {(step) => <>
      {step === 'control' ? <ControlCenter tournamentId={tournamentId} isAdmin={isAdmin} onSettings={goSettings} onStandings={() => goStep('bracket')} onMatches={() => goStep('matches')} onChanged={load} /> : null}
      {step === 'matches' ? <>{stagePicker}<ResultsTab {...stepProps} /></> : null}
      {step === 'bracket' ? <>{stagePicker}<StandingsTab {...stepProps} /><BracketTab {...stepProps} /></> : null}
      {step === 'settings' ? <div className="v2-console-settings">
        <SettingsTab {...stepProps} />
        <CourtsStep {...stepProps} />
        <TeamsTab {...stepProps} isAdmin={firstDivision?.play_type === 'doubles' ? false : isAdmin} />
        {isCommunity ? <div id="dang-ky-mo"><OpenRegTab {...stepProps} /></div> : null}
        <LogStep {...stepProps} />
        {isAdmin ? <DrawStep {...stepProps} /> : null}
      </div> : null}
    </>}
  </ConsoleShell>;
}
