'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { listClubRoster, loadSetupDraft, newIdempotencyKey, saveSetupDraft } from '@/lib/tournamentV2Client';
import { initialSaveState, isDirty, keyForNextSave, saveReducer } from '@/lib/tournament/setupSaveState';
import { computeSetupReadiness } from '@/lib/tournament/setupReadiness';
import { allowedStep } from '@/lib/tournament/setupStepRules';
import { emptyDraft } from '@/lib/tournament/setupDraftV3';

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

// Trạng thái + I/O của luồng tạo giải v3. Logic lưu nằm ở setupSaveState (thuần).
export function useSetupStudio({ tournamentId: initialTournamentId, divisionId: initialDivisionId, step: requestedStep }) {
  const [save, dispatch] = useReducer(saveReducer, undefined, () => initialSaveState({ draft: emptyDraft() }));
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
    listClubRoster().then((rows) => { if (alive) setRoster(Array.isArray(rows) ? rows : []); }).catch(() => {});
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
        // URL chỉ là yêu cầu; server quyết định bước được mở (không bypass bằng ?step=).
        setStep(allowedStep(requestedStep || setup?.resumeStep || 1, payload.completedThrough));
      })
      .catch((error) => { if (alive) setLoadError(error?.message || 'Không tải được bản nháp.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Chỉ tải lại khi đổi giải; ?step= đổi do chính workspace không làm tải lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTournamentId, initialDivisionId]);

  const ctx = useMemo(() => ({ members: roster.length ? memberContext(roster) : undefined, today: todayInVietnam() }), [roster]);
  const readiness = useMemo(() => computeSetupReadiness(save.draft, ctx), [save.draft, ctx]);

  const edit = useCallback((update) => dispatch({ type: 'edit', update }), []);

  const persist = useCallback(async () => {
    const current = saveRef.current;
    const key = keyForNextSave(current, newIdempotencyKey);
    const seq = ++seqRef.current;
    dispatch({ type: 'saveStart', key, seq });
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS) : null;
    try {
      const response = await saveSetupDraft({
        draft: { ...current.draft, currentStep: step },
        tournamentId: current.tournamentId,
        divisionId: current.divisionId,
        revision: current.revision,
        clientDraftKey: clientDraftKeyRef.current,
        idempotencyKey: key,
        signal: controller?.signal,
      });
      dispatch({ type: 'saveSuccess', seq, response });
      return { ok: true, completedThrough: response?.draft?.progress?.completedThrough ?? 0, response };
    } catch (error) {
      const failure = { code: error?.name === 'AbortError' ? 'SETUP_SAVE_TIMEOUT' : (error?.code || 'SETUP_SAVE_FAILED'), message: error?.message };
      dispatch({ type: 'saveFailure', seq, error: failure });
      return { ok: false, error: failure };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }, [step]);

  const reloadFromServer = useCallback(async (mode) => {
    const current = saveRef.current;
    if (!current.tournamentId) return;
    const setup = await loadSetupDraft(current.tournamentId, current.divisionId);
    const payload = hydratePayload(setup, current.tournamentId, current.divisionId);
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
    discard,
    reloadFromServer,
  };
}
