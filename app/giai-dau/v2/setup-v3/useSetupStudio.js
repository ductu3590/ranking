'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { drawSetup, finalizeSetup, listClubRoster, loadSetupDraft, newIdempotencyKey, saveSetupDraft } from '@/lib/tournamentV2Client';
import { initialSaveState, isDirty, keyForNextSave, saveReducer } from '@/lib/tournament/setupSaveState';
import { computeSetupReadiness } from '@/lib/tournament/setupReadiness';
import { allowedStep } from '@/lib/tournament/setupStepRules';
import { emptyDraft, normalizeDraft } from '@/lib/tournament/setupDraftV3';
import { clientFriendlyContext } from './friendly/friendlyContext';
import { clientCommunityContext } from './community/communityContext';

const SAVE_TIMEOUT_MS = 20000;

function todayInVietnam() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function memberContext(roster) {
  return new Map((roster || []).map((row) => [String(row.member_id), {
    name: row.full_name,
    active: row.is_active !== false,
    hasAthlete: row.athlete_id != null,
  }]));
}

function hydratePayload(setup, tournamentId, divisionId) {
  const draft = setup?.draft || emptyDraft();
  return {
    draft,
    tournamentId,
    divisionId,
    revision: Number(draft.revision) || 1,
    completedThrough: draft.progress?.completedThrough || 0,
  };
}

// Bản nháp trống theo loại giải chọn từ dashboard (?create=friendly). Loại giải ghi vào bản nháp ở lần lưu đầu,
// sau đó server khoá (ORGANIZER_MODE_LOCKED).
// Giải cộng đồng (Epic 4 C3) luôn dùng bản nháp 'internal' (chế độ cộng đồng do tournaments.organizer_type quyết định, không do bản nháp).
function blankDraft(organizerMode) {
  if (organizerMode !== 'friendly') return emptyDraft();
  const draft = emptyDraft();
  return normalizeDraft({ ...draft, tournament: { ...draft.tournament, organizerMode: 'friendly' } });
}

// Trạng thái + I/O của luồng tạo giải v3. Logic lưu nằm ở setupSaveState (thuần).
export function useSetupStudio({ tournamentId: initialTournamentId, divisionId: initialDivisionId, step: requestedStep, organizerMode = 'internal' }) {
  const [save, dispatch] = useReducer(saveReducer, undefined, () => initialSaveState({ draft: blankDraft(organizerMode) }));
  // Khối `friendly` của GET /setup (chỉ giải giao hữu): CLB tham dự, hạn mức, cặp CLB khách đã duyệt.
  const [friendly, setFriendly] = useState(null);
  // Khối `community` của GET /setup (chỉ giải cộng đồng): các cặp đã duyệt (tên + PHR) và bộ đếm đơn còn lại.
  const [community, setCommunity] = useState(null);
  const [step, setStep] = useState(1);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(Boolean(initialTournamentId && initialDivisionId));
  const [loadError, setLoadError] = useState('');
  const seqRef = useRef(0);
  const clientDraftKeyRef = useRef(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  if (!clientDraftKeyRef.current) clientDraftKeyRef.current = `draft_${newIdempotencyKey()}`;

  useEffect(() => {
    let alive = true;
    // Giải cộng đồng không chọn thành viên CLB → không nạp danh bạ CLB hệ thống.
    if (organizerMode !== 'community') listClubRoster().then((rows) => { if (alive) setRoster(Array.isArray(rows) ? rows : []); }).catch(() => {});
    // Id vừa do chính lần lưu đầu tạo ra (URL cập nhật theo) → đã có dữ liệu, không tải lại.
    if (initialTournamentId && saveRef.current.tournamentId === String(initialTournamentId)) return () => { alive = false; };
    if (!(initialTournamentId && initialDivisionId)) {
      setStep(1);
      return () => { alive = false; };
    }
    setLoading(true);
    loadSetupDraft(initialTournamentId, initialDivisionId)
      .then((setup) => {
        if (!alive) return;
        const payload = hydratePayload(setup, initialTournamentId, initialDivisionId);
        if (payload.draft.clientDraftKey) clientDraftKeyRef.current = payload.draft.clientDraftKey;
        dispatch({ type: 'hydrate', payload });
        setFriendly(setup?.friendly || null);
        setCommunity(setup?.community || null);
        // URL chỉ là yêu cầu; server quyết định bước được mở (không bypass bằng ?step=).
        setStep(allowedStep(requestedStep || setup?.resumeStep || 1, payload.completedThrough));
      })
      .catch((error) => { if (alive) setLoadError(error?.message || 'Không tải được bản nháp.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Chỉ tải lại khi đổi giải; ?step= đổi do chính workspace không làm tải lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTournamentId, initialDivisionId]);

  const friendlyCtx = useMemo(() => clientFriendlyContext(friendly), [friendly]);
  const communityCtx = useMemo(() => clientCommunityContext(community), [community]);
  const ctx = useMemo(() => ({
    members: roster.length ? memberContext(roster) : undefined,
    today: todayInVietnam(),
    ...(friendlyCtx ? { friendly: friendlyCtx } : {}),
    ...(communityCtx ? { community: communityCtx } : {}),
  }), [roster, friendlyCtx, communityCtx]);

  // Tải lại riêng khối `friendly` (sau khi mời/duyệt/khoá… hoặc khi quay lại Bước 2–4); không đụng bản nháp đang sửa.
  const reloadFriendly = useCallback(async () => {
    const current = saveRef.current;
    if (!current.tournamentId || !current.divisionId) return null;
    try {
      const setup = await loadSetupDraft(current.tournamentId, current.divisionId);
      setFriendly(setup?.friendly || null);
      // CLB khách vừa được duyệt/rút → server tính lại progress (completedThrough). Không có thay đổi chưa lưu thì
      // nạp lại để bước mở đúng; reducer tự bỏ qua khi đang sửa/đang lưu/xung đột.
      if (setup && !isDirty(saveRef.current)) {
        dispatch({ type: 'hydrate', payload: { ...hydratePayload(setup, current.tournamentId, current.divisionId), savedAt: saveRef.current.lastSavedAt } });
      }
      return setup?.friendly || null;
    } catch {
      return null;
    }
  }, []);

  // Tải lại riêng khối `community` (đơn vừa được duyệt / ghép hộ ở bảng duyệt) khi quay lại Bước 2–4; không đụng bản nháp đang sửa.
  const reloadCommunity = useCallback(async () => {
    const current = saveRef.current;
    if (!current.tournamentId || !current.divisionId) return null;
    try {
      const setup = await loadSetupDraft(current.tournamentId, current.divisionId);
      setCommunity(setup?.community || null);
      if (setup && !isDirty(saveRef.current)) {
        dispatch({ type: 'hydrate', payload: { ...hydratePayload(setup, current.tournamentId, current.divisionId), savedAt: saveRef.current.lastSavedAt } });
      }
      return setup?.community || null;
    } catch {
      return null;
    }
  }, []);

  // Giải giao hữu vừa tạo ở lần lưu đầu: nạp khối `friendly` để Bước 2 có khu "CLB tham dự".
  const isFriendly = save.draft.tournament.organizerMode === 'friendly';
  useEffect(() => {
    if (isFriendly && save.tournamentId && save.divisionId && !friendly) reloadFriendly();
  }, [friendly, isFriendly, reloadFriendly, save.divisionId, save.tournamentId]);
  const readiness = useMemo(() => computeSetupReadiness(save.draft, ctx), [save.draft, ctx]);

  const edit = useCallback((update) => dispatch({ type: 'edit', update }), []);

  // Mọi thao tác ghi bản nháp (lưu, bốc thăm) đi qua cùng máy trạng thái lưu.
  const runMutation = useCallback(async (send, { freshKey = false } = {}) => {
    const current = saveRef.current;
    const key = freshKey ? newIdempotencyKey() : keyForNextSave(current, newIdempotencyKey);
    const seq = ++seqRef.current;
    dispatch({ type: 'saveStart', key, seq });
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS) : null;
    try {
      const response = await send({ current, key, signal: controller?.signal });
      dispatch({ type: 'saveSuccess', seq, response });
      return { ok: true, completedThrough: response?.draft?.progress?.completedThrough ?? 0, response };
    } catch (error) {
      const failure = {
        code: error?.name === 'AbortError' ? 'SETUP_SAVE_TIMEOUT' : (error?.code || 'SETUP_SAVE_FAILED'),
        message: error?.message,
        params: error?.details?.params,
      };
      dispatch({ type: 'saveFailure', seq, error: failure, retryable: !freshKey });
      return { ok: false, error: failure };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }, []);

  const persist = useCallback(() => runMutation(({ current, key, signal }) => saveSetupDraft({
    draft: { ...current.draft, currentStep: step },
    tournamentId: current.tournamentId,
    divisionId: current.divisionId,
    revision: current.revision,
    clientDraftKey: clientDraftKeyRef.current,
    idempotencyKey: key,
    signal,
  })), [runMutation, step]);

  // Bốc thăm ('draw') hoặc cập nhật xem trước giữ seed ('preview'); server lưu vào nháp.
  const draw = useCallback((action = 'draw') => runMutation(({ current, key }) => drawSetup({
    tournamentId: current.tournamentId,
    divisionId: current.divisionId,
    revision: current.revision,
    idempotencyKey: key,
    action,
  }), { freshKey: true }), [runMutation]);

  // Chốt: một key cho cùng (revision, fingerprint) để thử lại không tạo hai giải.
  const finalizeKeyRef = useRef({ scope: null, key: null });
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);
  const finalize = useCallback(async () => {
    const current = saveRef.current;
    const scope = `${current.revision}:${current.draft.draw.previewFingerprint}`;
    if (finalizeKeyRef.current.scope !== scope) finalizeKeyRef.current = { scope, key: newIdempotencyKey() };
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const result = await finalizeSetup({
        tournamentId: current.tournamentId,
        divisionId: current.divisionId,
        revision: current.revision,
        idempotencyKey: finalizeKeyRef.current.key,
        previewFingerprint: current.draft.draw.previewFingerprint,
      });
      return { ok: true, result };
    } catch (error) {
      const failure = { code: error?.code || 'FINALIZE_NOT_ATOMIC', message: error?.message, params: error?.details?.params };
      setFinalizeError(failure);
      return { ok: false, error: failure };
    } finally {
      setFinalizing(false);
    }
  }, []);

  const reloadFromServer = useCallback(async (mode) => {
    const current = saveRef.current;
    if (!current.tournamentId) return;
    const setup = await loadSetupDraft(current.tournamentId, current.divisionId);
    const payload = hydratePayload(setup, current.tournamentId, current.divisionId);
    setFriendly(setup?.friendly || null);
    setCommunity(setup?.community || null);
    if (mode === 'keep') dispatch({ type: 'conflictKeepMine', revision: payload.revision });
    else {
      dispatch({ type: 'conflictReload', payload });
      setStep((value) => allowedStep(value, payload.completedThrough));
    }
  }, []);

  const discard = useCallback(() => dispatch({ type: 'discard' }), []);

  return {
    save,
    step,
    setStep,
    roster,
    loading,
    loadError,
    readiness,
    dirty: isDirty(save),
    edit,
    persist,
    draw,
    finalize,
    finalizing,
    finalizeError,
    discard,
    reloadFromServer,
    friendly,
    reloadFriendly,
    isFriendly,
    community,
    reloadCommunity,
    isCommunity: organizerMode === 'community' || Boolean(community),
  };
}
