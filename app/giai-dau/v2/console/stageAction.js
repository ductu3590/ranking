'use client';

import { advanceStage, updateTournament } from '@/lib/tournamentV2Client';

// Hành động chuyển chặng / kết thúc giải dùng chung cho mục Điều hành (thẻ việc tiếp theo) và
// "Sơ đồ & xếp hạng" (D35, nghiệm thu Epic 2). `action` là board.stageAction của GET /operations:
//   advance  — chốt BXH chặng, điền cặp đi tiếp vào chặng sau;
//   finish   — chốt chặng cuối rồi chuyển giải sang "Đã kết thúc" (ghi hạng chung cuộc);
//   complete — mọi chặng đã chốt, chỉ còn chuyển trạng thái giải.
// Vòng đời chỉ cho live → completed, nên giải còn "Chờ diễn ra" đi qua live trước.
async function markTournamentCompleted(tournamentId, status) {
  if (status === 'scheduled') await updateTournament({ id: Number(tournamentId), status: 'live' });
  return updateTournament({ id: Number(tournamentId), status: 'completed' });
}

export async function runStageAction(action, tournamentId) {
  if (!action) return null;
  if (action.kind === 'advance') {
    const result = await advanceStage(action.stageId);
    return { message: `Đã chốt ${action.stageName} — các cặp đi tiếp đã vào ${action.nextStageName}.`, result };
  }
  if (action.kind === 'finish') {
    const result = await advanceStage(action.stageId);
    await markTournamentCompleted(tournamentId, action.tournamentStatus);
    return { message: 'Đã kết thúc giải và chốt xếp hạng chung cuộc.', result };
  }
  if (action.kind === 'complete') {
    await markTournamentCompleted(tournamentId, action.tournamentStatus);
    return { message: 'Đã kết thúc giải và chốt xếp hạng chung cuộc.', result: null };
  }
  return null;
}

export function stageActionLabel(action) {
  if (!action) return '';
  if (action.kind === 'advance') return `Chốt ${action.stageName} & vào ${action.nextStageName}`;
  return 'Kết thúc giải & chốt xếp hạng';
}
