'use client';

import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

export const SETUP_STEPS = [
  { id: 1, key: 'info', label: 'Thông tin & người tham gia', shortLabel: 'Thông tin', description: 'Tên giải, ngày đấu và danh sách thành viên.' },
  { id: 2, key: 'format', label: 'Thể thức & ghép cặp', shortLabel: 'Ghép cặp', description: 'Chọn thể thức, kiểm tra cặp và dự bị.' },
  { id: 3, key: 'draw', label: 'Bốc thăm & xem trước lịch', shortLabel: 'Bốc thăm', description: 'Bảng đấu, nhánh loại trực tiếp và lịch nháp.' },
  { id: 4, key: 'review', label: 'Kiểm tra và chốt', shortLabel: 'Chốt lịch', description: 'Kiểm tra blocker trước khi tạo lịch chính thức.' },
];

const STEP_COUNT = SETUP_STEPS.length;
const STEP_BY_ID = new Map(SETUP_STEPS.map((step) => [step.id, step]));
const STEP_BY_KEY = new Map(SETUP_STEPS.map((step) => [step.key, step]));

export const SAVE_STATUS_LABELS = {
  idle: 'Chưa lưu',
  dirty: 'Có thay đổi chưa lưu',
  saving: 'Đang lưu...',
  saved: 'Đã lưu',
  error: 'Lưu thất bại',
};

function clampStep(step) {
  const numeric = Number(step);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(STEP_COUNT, Math.round(numeric)));
}

function normalizeStep(step) {
  if (typeof step === 'string' && STEP_BY_KEY.has(step)) return STEP_BY_KEY.get(step).id;
  return clampStep(step);
}

function normalizeInvitedClub(row) {
  const source = row && typeof row === 'object' ? row : {};
  const clubId = source.clubId ?? source.club_id ?? null;
  return {
    clubId: clubId == null || clubId === '' ? null : Number(clubId),
    name: String(source.name || source.clubName || '').trim(),
    source: source.source === 'external' ? 'external' : 'system',
    status: source.status || 'pending',
  };
}

function withOrganizerReadiness(draft) {
  const readiness = draft.readiness || { blockers: [], warnings: [] };
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers.filter((item) => item?.code !== 'NO_CLUB_INVITED') : [];
  if (draft.tournament?.organizerMode === 'friendly' && (!Array.isArray(draft.invitedClubs) || draft.invitedClubs.length === 0)) {
    blockers.push({ code: 'NO_CLUB_INVITED', message: 'Hãy mời ít nhất một CLB.', severity: 'blocker' });
  }
  return { ...draft, readiness: { ...readiness, blockers } };
}

function normalizeDraft(draft) {
  const safeDraft = draft && typeof draft === 'object' ? draft : {};
  const tournament = safeDraft.tournament || {};
  const normalized = {
    draftVersion: safeDraft.draftVersion || 2,
    draftId: safeDraft.draftId || null,
    tournamentId: safeDraft.tournamentId || null,
    divisionId: safeDraft.divisionId || null,
    state: safeDraft.state || 'local_only',
    revision: Number.isFinite(Number(safeDraft.revision)) ? Number(safeDraft.revision) : 0,
    currentStep: normalizeStep(safeDraft.currentStep || 1),
    tournament: { ...tournament, organizerMode: tournament.organizerMode === 'friendly' ? 'friendly' : 'internal' },
    invitedClubs: Array.isArray(safeDraft.invitedClubs) ? safeDraft.invitedClubs.map(normalizeInvitedClub).filter((club) => club.name) : [],
    participants: safeDraft.participants || {},
    format: safeDraft.format || {},
    pairs: Array.isArray(safeDraft.pairs) ? safeDraft.pairs : [],
    unpairedMemberIds: Array.isArray(safeDraft.unpairedMemberIds) ? safeDraft.unpairedMemberIds : [],
    reserveMemberIds: Array.isArray(safeDraft.reserveMemberIds) ? safeDraft.reserveMemberIds : [],
    draw: safeDraft.draw || {},
    readiness: safeDraft.readiness || { blockers: [], warnings: [] },
    invalidation: safeDraft.invalidation || {},
    savedAt: safeDraft.savedAt || null,
    finalizedAt: safeDraft.finalizedAt || null,
  };
  return withOrganizerReadiness(normalized);
}

function getBlockers(draft) {
  const blockers = draft?.readiness?.blockers;
  return Array.isArray(blockers) ? blockers : [];
}

function getWarnings(draft) {
  const warnings = draft?.readiness?.warnings;
  return Array.isArray(warnings) ? warnings : [];
}

export function createSetupInitialState(options = {}) {
  const draft = normalizeDraft(options.draft || options.initialDraft);
  const resumeStep = normalizeStep(options.resumeStep || draft.currentStep || 1);
  const highestAllowedStep = Math.max(1, Math.min(normalizeStep(options.highestAllowedStep || resumeStep), STEP_COUNT));

  return {
    draft: { ...draft, currentStep: resumeStep },
    currentStep: resumeStep,
    highestAllowedStep,
    saveStatus: options.saveStatus || 'idle',
    saveError: null,
    lastSavedAt: draft.savedAt || null,
    isFinalizing: false,
    finalizeError: null,
    focusStepAfterChange: false,
  };
}

function markDirty(state, draft) {
  return {
    ...state,
    draft,
    saveStatus: state.saveStatus === 'saving' ? 'saving' : 'dirty',
    saveError: null,
  };
}

export function setupReducer(state, action) {
  switch (action.type) {
    case 'hydrate': {
      const nextState = createSetupInitialState({
        draft: action.draft,
        resumeStep: action.resumeStep || action.draft?.currentStep,
        saveStatus: action.saveStatus || 'idle',
      });
      return { ...state, ...nextState };
    }
    case 'goToStep': {
      const targetStep = normalizeStep(action.step);
      if (targetStep > state.highestAllowedStep) return { ...state, focusStepAfterChange: false };
      return {
        ...state,
        currentStep: targetStep,
        draft: { ...state.draft, currentStep: targetStep },
        focusStepAfterChange: Boolean(action.focus),
      };
    }
    case 'unlockStep': {
      return { ...state, highestAllowedStep: Math.max(state.highestAllowedStep, normalizeStep(action.step)) };
    }
    case 'patchDraft': {
      const patch = action.patch && typeof action.patch === 'object' ? action.patch : {};
      const draft = normalizeDraft({ ...state.draft, ...patch });
      return markDirty(state, draft);
    }
    case 'replaceDraft': {
      const draft = normalizeDraft(action.draft);
      return {
        ...state,
        draft,
        currentStep: normalizeStep(action.resumeStep || draft.currentStep),
        highestAllowedStep: Math.max(state.highestAllowedStep, normalizeStep(action.highestAllowedStep || draft.currentStep)),
        saveStatus: action.saveStatus || state.saveStatus,
        lastSavedAt: draft.savedAt || state.lastSavedAt,
      };
    }
    case 'saveStart':
      return { ...state, saveStatus: 'saving', saveError: null };
    case 'saveSuccess': {
      const draft = normalizeDraft(action.draft || state.draft);
      return {
        ...state,
        draft,
        saveStatus: 'saved',
        saveError: null,
        lastSavedAt: draft.savedAt || new Date().toISOString(),
        highestAllowedStep: Math.max(state.highestAllowedStep, normalizeStep(draft.currentStep || state.currentStep)),
      };
    }
    case 'saveError':
      return { ...state, saveStatus: 'error', saveError: action.error || 'Không lưu được nháp.' };
    case 'finalizeStart':
      return { ...state, isFinalizing: true, finalizeError: null };
    case 'finalizeSuccess': {
      const draft = normalizeDraft(action.draft || state.draft);
      return { ...state, draft, isFinalizing: false, finalizeError: null, saveStatus: 'saved' };
    }
    case 'finalizeError':
      return { ...state, isFinalizing: false, finalizeError: action.error || 'Không thể chốt lịch.' };
    default:
      return state;
  }
}

function createMockAdapter() {
  return {
    async loadDraft() {
      return { draft: createSetupInitialState().draft };
    },
    async saveDraft(draft) {
      return { draft: { ...draft, savedAt: new Date().toISOString(), state: draft.state === 'local_only' ? 'server_draft' : draft.state } };
    },
    async finalizeDraft(draft) {
      return { draft: { ...draft, finalizedAt: new Date().toISOString(), state: 'finalized' }, redirectTo: null };
    },
  };
}

const SetupContext = createContext(null);

export function TournamentSetupProvider({ children, initialDraft, adapter, resumeStep }) {
  const [state, dispatch] = useReducer(setupReducer, { initialDraft, resumeStep }, createSetupInitialState);
  const ioAdapter = useMemo(() => adapter || createMockAdapter(), [adapter]);

  const goToStep = useCallback((step, options = {}) => {
    dispatch({ type: 'goToStep', step, focus: options.focus !== false });
  }, []);

  const patchDraft = useCallback((patch) => {
    dispatch({ type: 'patchDraft', patch });
  }, []);

  const saveDraft = useCallback(async () => {
    dispatch({ type: 'saveStart' });
    try {
      const result = await ioAdapter.saveDraft(state.draft);
      dispatch({ type: 'saveSuccess', draft: result?.draft || state.draft });
      return result;
    } catch (error) {
      dispatch({ type: 'saveError', error: error?.message });
      throw error;
    }
  }, [ioAdapter, state.draft]);

  const finalizeDraft = useCallback(async () => {
    dispatch({ type: 'finalizeStart' });
    try {
      const result = await ioAdapter.finalizeDraft(state.draft);
      dispatch({ type: 'finalizeSuccess', draft: result?.draft || state.draft });
      return result;
    } catch (error) {
      dispatch({ type: 'finalizeError', error: error?.message });
      throw error;
    }
  }, [ioAdapter, state.draft]);

  const value = useMemo(() => {
    const blockers = getBlockers(state.draft);
    const warnings = getWarnings(state.draft);
    return {
      state,
      dispatch,
      adapter: ioAdapter,
      steps: SETUP_STEPS,
      currentStepMeta: STEP_BY_ID.get(state.currentStep) || SETUP_STEPS[0],
      blockers,
      warnings,
      canFinalize: blockers.length === 0 && state.currentStep === STEP_COUNT && state.saveStatus === 'saved',
      goToStep,
      patchDraft,
      saveDraft,
      finalizeDraft,
    };
  }, [finalizeDraft, goToStep, ioAdapter, patchDraft, saveDraft, state]);

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useTournamentSetup() {
  const context = useContext(SetupContext);
  if (!context) {
    throw new Error('useTournamentSetup must be used inside TournamentSetupProvider');
  }
  return context;
}
