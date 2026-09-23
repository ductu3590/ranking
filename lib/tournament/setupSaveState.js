'use strict';
// Máy trạng thái lưu từng bước của luồng tạo giải (spec Lát 0 §4.2). Thuần để test
// bằng node; hook React chỉ nối I/O vào đây.
//
// Bất biến:
// - Response về muộn (seq cũ) không bao giờ ghi đè edit mới.
// - Lỗi mạng/timeout giữ dữ liệu đang nhập; thử lại khi chưa sửa gì dùng LẠI đúng
//   idempotency key cũ, đã sửa thì dùng key mới.
// - Conflict revision không tự ghi đè: chờ người dùng chọn.

const { normalizeDraft } = require('./setupDraftV3');

const CONFLICT_CODES = new Set(['SETUP_REVISION_CONFLICT', 'REVISION_CONFLICT']);

function initialSaveState({ draft, tournamentId = null, divisionId = null, revision = 1, completedThrough = 0, savedAt = null } = {}) {
  const normalized = normalizeDraft(draft);
  return {
    draft: normalized,
    confirmed: tournamentId ? normalized : null,
    tournamentId: tournamentId ? String(tournamentId) : null,
    divisionId: divisionId ? String(divisionId) : null,
    revision: Math.max(1, Number(revision) || 1),
    completedThrough: Number(completedThrough) || 0,
    status: tournamentId ? 'saved' : 'idle',
    error: null,
    editVersion: 0,
    pending: null,
    retryKey: null,
    lastSavedAt: savedAt,
    conflict: null,
  };
}

function saveReducer(state, action) {
  switch (action.type) {
    case 'hydrate': {
      if (state.status === 'dirty' || state.status === 'saving' || state.status === 'conflict') return state;
      return initialSaveState(action.payload);
    }
    case 'edit': {
      const draft = normalizeDraft(typeof action.update === 'function' ? action.update(state.draft) : action.draft);
      return { ...state, draft, status: 'dirty', error: null, editVersion: state.editVersion + 1, retryKey: null };
    }
    case 'discard': {
      if (!state.confirmed) return state;
      return { ...state, draft: state.confirmed, status: 'saved', error: null, editVersion: state.editVersion + 1, retryKey: null };
    }
    case 'saveStart':
      return { ...state, status: 'saving', error: null, pending: { key: action.key, seq: action.seq, editVersion: state.editVersion } };
    case 'saveSuccess': {
      if (!state.pending || state.pending.seq !== action.seq) return state;
      const response = action.response || {};
      const saved = normalizeDraft(response.draft);
      const untouched = state.editVersion === state.pending.editVersion;
      return {
        ...state,
        tournamentId: String(response.tournament_id || state.tournamentId || '') || null,
        divisionId: String(response.division_id || state.divisionId || '') || null,
        revision: Math.max(1, Number(response.setup_revision) || state.revision),
        completedThrough: saved.progress.completedThrough,
        confirmed: saved,
        draft: untouched ? { ...saved, currentStep: state.draft.currentStep } : state.draft,
        status: untouched ? 'saved' : 'dirty',
        pending: null,
        retryKey: null,
        lastSavedAt: action.at || new Date().toISOString(),
        conflict: null,
      };
    }
    case 'saveFailure': {
      if (!state.pending || state.pending.seq !== action.seq) return state;
      const code = action.error?.code;
      const untouched = state.editVersion === state.pending.editVersion;
      if (CONFLICT_CODES.has(code)) {
        return { ...state, status: 'conflict', error: action.error, pending: null, retryKey: null, conflict: { code } };
      }
      return {
        ...state,
        status: untouched ? 'error' : 'dirty',
        error: action.error || { code: 'SETUP_SAVE_FAILED' },
        pending: null,
        retryKey: untouched ? state.pending.key : null,
      };
    }
    case 'conflictReload':
      return initialSaveState(action.payload);
    case 'conflictKeepMine':
      // Giữ bản đang sửa; lần lưu sau ghi đè lên revision mới nhất của server (có chủ đích).
      return { ...state, status: 'dirty', error: null, conflict: null, revision: Math.max(1, Number(action.revision) || state.revision), retryKey: null };
    case 'setStep':
      return { ...state, draft: { ...state.draft, currentStep: action.step } };
    default:
      return state;
  }
}

// Key cho lần lưu kế tiếp: thử lại khi chưa sửa → key cũ; ngược lại → key mới.
function keyForNextSave(state, makeKey) {
  return state.retryKey || makeKey();
}

function isDirty(state) {
  return state.status === 'dirty' || state.status === 'error' || state.status === 'conflict' || state.status === 'saving';
}

module.exports = { initialSaveState, saveReducer, keyForNextSave, isDirty };
